// popup.js

// A centralized place for all DOM element IDs to prevent typos
// and make the code easier to maintain.
import {
  getADOSettings,
  saveADOSettings,
  deleteLog,
  getTasksForDate,
  getWorkItemDetailsAndHierarchy,
  saveTasksForDate,
} from './storage.js';

import {
  fetchProjects,
  fetchWorkItems,
} from './api.js';

import {
  showMessage,
  formatTime,
  displayDailyTotal,
  showLoading,
} from './ui.js';

const UI = {
  // Dates
  taskDate: "taskDate",
  filterDate: "filterDate",

  // Forms
  addTaskForm: "addTaskForm",
  addOrgForm: "addOrgForm",
  // ✅ ADDED: New ID for the name input
  newAssignedToName: "newAssignedToName",

  // Settings
  organizationSelect: "organizationSelect",
  projectSelector: "projectSelector",
  workItemSelector: "workItemSelector",
  viewOrgSelector: "viewOrgSelector",
  viewProjectSelector: "viewProjectSelector",
  viewWorkItemSelector: "viewWorkItemSelector",

  // Groups and Loaders
  projectSelectorGroup: "projectSelectorGroup",
  workItemSelectorGroup: "workItemSelectorGroup",
  viewProjectSelectorGroup: "viewProjectSelectorGroup",
  viewWorkItemSelectorGroup: "viewWorkItemSelectorGroup",
  projectLoading: "projectLoading",
  workItemLoading: "workItemLoading",
  viewProjectLoading: "viewProjectLoading",
  viewWorkItemLoading: "viewWorkItemLoading",

  // Task List
  taskList: "taskList",

  // Buttons
  retryButton: "retryButton",
  clearAllSettingsBtn: "clearAllSettingsBtn",
  toggleNewPat: "toggleNewPat",

  // Other
  orgPatList: "orgPatList",
  clearFiltersBtn: "clearFiltersBtn",
  refreshLogsBtn: "refreshLogsBtn",
};

/**
 * Initializes the UI on startup.
 */
function initializeUI() {
  const today = new Date().toISOString().split("T")[0];
  document.getElementById(UI.taskDate).setAttribute('max', today);
  document.getElementById(UI.filterDate).setAttribute('max', today);
  document.getElementById(UI.taskDate).value = today;
  document.getElementById(UI.filterDate).value = today;
}

/**
 * Attaches all the necessary event listeners to the DOM elements.
 */
function attachEventListeners() {
  document.getElementById(UI.addTaskForm).addEventListener("submit", (e) => {
    e.preventDefault();
    addTask();
  });

  document.getElementById(UI.filterDate).addEventListener("change", (e) => loadTasksForDate(e.target.value));

  document.getElementById(UI.viewOrgSelector).addEventListener("change", (e) => {
    const org = e.target.value;
    showViewProjectSelector(!!org);
    if (org) loadProjects(org, UI.viewProjectSelector);
    applyFilters();
  });

  document.getElementById(UI.viewProjectSelector).addEventListener("change", (e) => {
    const projectId = e.target.value;
    const org = document.getElementById(UI.viewOrgSelector).value;
    showViewWorkItemSelector(!!projectId && !!org);
    if (projectId && org) loadWorkItems(org, projectId, UI.viewWorkItemSelector);
    applyFilters();
  });

  document.getElementById(UI.viewWorkItemSelector).addEventListener("change", applyFilters);

  document.getElementById(UI.taskList).addEventListener("click", handleTaskListActions);

  document.getElementById(UI.organizationSelect).addEventListener("change", (e) => {
    const org = e.target.value;
    if (org) loadProjects(org, UI.projectSelector);
  });

  document.getElementById(UI.projectSelector).addEventListener("change", (e) => {
    const projectId = e.target.value;
    const org = document.getElementById(UI.organizationSelect).value;
    showWorkItemSelector(!!projectId && !!org);
    if (projectId && org) loadWorkItems(org, projectId, UI.workItemSelector);
  });

  document.getElementById(UI.retryButton).addEventListener("click", handleRetryClick);
  document.getElementById(UI.addOrgForm).addEventListener("submit", handleAddOrganization);

  // ✅ MODIFIED: This button now calls resetOrgForm to handle both reset and cancel
  document.getElementById(UI.clearAllSettingsBtn).addEventListener("click", resetOrgForm);

  // ✅ MODIFIED: Event listener now also handles clicks on the new edit button
  document.getElementById(UI.orgPatList).addEventListener("click", (e) => {
    if (e.target.classList.contains("delete-org-btn")) {
      handleDeleteOrganization(e.target.dataset.org);
    } else if (e.target.classList.contains("edit-org-btn")) {
      populateFormForEdit(e.target.dataset.org);
    }
  });

  document.getElementById(UI.toggleNewPat).addEventListener("click", () => {
    const patInput = document.getElementById("newPat");
    patInput.type = patInput.type === "password" ? "text" : "password";
  });

  document.getElementById(UI.clearFiltersBtn).addEventListener("click", handleClearFilters);
  
  document.getElementById(UI.refreshLogsBtn).addEventListener("click", handleRefreshLogs);
  
  document.querySelector('.tab-buttons').addEventListener('click', (e) => {
    if (e.target.matches('.tab-btn')) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
      const tabId = e.target.dataset.tab;
      e.target.classList.add('active');
      document.getElementById(tabId).classList.add('active');
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("Popup DOM loaded, initializing...");
  initializeUI();
  attachEventListeners();
  await loadTasksForDate(document.getElementById(UI.filterDate).value);
  await initializeAzureDevOpsSettings();
  await checkAndPreSelectWorkItem();
});

async function getPatForOrg(org) {
  const settings = await getADOSettings();
  
  if (Array.isArray(settings)) {
      const orgSetting = settings.find(s => s.organization === org);
      return orgSetting ? orgSetting.pat : null;
  } else if (typeof settings === 'object' && settings.organization === org) {
      return settings.pat;
  }
  
  return null;
}

// ✅ MODIFIED: Function now handles both adding a new organization and updating an existing one.
async function handleAddOrganization(e) {
  e.preventDefault();
  const editingOrgName = document.getElementById("editingOrgName").value;
  const newOrgName = document.getElementById("newOrganization").value.trim();
  const assignedToName = document.getElementById(UI.newAssignedToName).value.trim();
  const pat = document.getElementById("newPat").value.trim();
  const expiryDate = document.getElementById("newExpiryDate").value;

  if (!newOrgName || !pat || !expiryDate || !assignedToName) {
      showMessage("Please fill in all fields.", "error");
      return;
  }

  const currentSettings = await getADOSettings();
  let settingsArray = Array.isArray(currentSettings) ? [...currentSettings] : [];

  // Check if the new organization name already exists (if not in edit mode or if the name was changed)
  if (editingOrgName !== newOrgName) {
    const existingOrg = settingsArray.find(s => s.organization.toLowerCase() === newOrgName.toLowerCase());
    if (existingOrg) {
      showMessage("An organization with this name already exists.", "error");
      return;
    }
  }

  if (editingOrgName) {
    // --- UPDATE LOGIC ---
    const orgIndex = settingsArray.findIndex(s => s.organization === editingOrgName);
    if (orgIndex > -1) {
      settingsArray[orgIndex] = {
        organization: newOrgName,
        pat: pat,
        assignedToName: assignedToName,
        expiresAt: new Date(expiryDate).toISOString()
      };
      showMessage("Organization updated successfully!", "success");
    }
  } else {
    // --- ADD LOGIC ---
    settingsArray.push({
      organization: newOrgName,
      pat: pat,
      assignedToName: assignedToName,
      expiresAt: new Date(expiryDate).toISOString()
    });
    showMessage("Organization added successfully!", "success");
  }

  await saveADOSettings(settingsArray);
  await refreshSettingsUI();
  resetOrgForm();
}

async function handleDeleteOrganization(orgNameToDelete) {
  if (confirm(`Are you sure you want to delete the organization "${orgNameToDelete}"?`)) {
      const currentSettings = await getADOSettings();
      let newSettings = [];

      if (Array.isArray(currentSettings)) {
          newSettings = currentSettings.filter(s => s.organization !== orgNameToDelete);
      } else if (typeof currentSettings === 'object' && currentSettings.organization === orgNameToDelete) {
          newSettings = [];
      } else {
          newSettings = currentSettings;
      }

      await saveADOSettings(newSettings);
      await refreshSettingsUI();
  }
}

/**
 * 🆕 ADDED: Resets the organization form to its default "Add" state.
 */
function resetOrgForm() {
  document.getElementById("addOrgForm").reset();
  document.getElementById("editingOrgName").value = ""; // Clear the hidden input
  document.getElementById("settingsFormTitle").textContent = "Add New Organization";
  document.getElementById("addOrUpdateOrgBtn").textContent = "Add Organization";
  document.getElementById(UI.clearAllSettingsBtn).textContent = "Reset Form";
}

/**
 * 🆕 ADDED: Populates the settings form with data for a specific organization.
 * @param {string} orgName The name of the organization to edit.
 */
async function populateFormForEdit(orgName) {
  const settings = await getADOSettings();
  const orgSettings = settings.find(s => s.organization === orgName);

  if (orgSettings) {
    document.getElementById("editingOrgName").value = orgSettings.organization;
    document.getElementById("newOrganization").value = orgSettings.organization;
    document.getElementById(UI.newAssignedToName).value = orgSettings.assignedToName;
    document.getElementById("newPat").value = orgSettings.pat;
    // Format date for the input field: YYYY-MM-DD
    document.getElementById("newExpiryDate").value = new Date(orgSettings.expiresAt).toISOString().split('T')[0];

    // Update UI to "Edit Mode"
    document.getElementById("settingsFormTitle").textContent = "Edit Organization";
    document.getElementById("addOrUpdateOrgBtn").textContent = "Save Changes";
    document.getElementById(UI.clearAllSettingsBtn).textContent = "Cancel";
  }
}


async function populateOrganizationDropdowns() {
  const settings = await getADOSettings();
  let orgs = [];

  if (Array.isArray(settings)) {
      orgs = settings.map(s => s.organization);
  } else if (typeof settings === 'object' && settings.organization) {
      orgs = [settings.organization];
  }

  const addSelector = document.getElementById(UI.organizationSelect);
  const viewSelector = document.getElementById(UI.viewOrgSelector);

  addSelector.innerHTML = '<option value="">Select organization...</option>';
  viewSelector.innerHTML = '<option value="">All organizations</option>';

  orgs.forEach(org => {
      const addOption = document.createElement("option");
      addOption.value = org;
      addOption.textContent = org;
      addSelector.appendChild(addOption);

      const viewOption = document.createElement("option");
      viewOption.value = org;
      viewOption.textContent = org;
      viewSelector.appendChild(viewOption);
  });
}

async function handleRefreshLogs() {
  const refreshBtn = document.getElementById(UI.refreshLogsBtn);
  const currentDate = document.getElementById(UI.filterDate).value;
  
  if (!currentDate) {
    showMessage("Please select a date to refresh.", "error");
    return;
  }

  try {
    // Provide visual feedback that something is happening
    refreshBtn.innerHTML = "⏳";
    refreshBtn.disabled = true;

    await loadTasksForDate(currentDate);
    showMessage("Logs refreshed!", "success");

  } catch (error) {
    showMessage("Failed to refresh logs.", "error");
    console.error("Error during manual refresh:", error);
  } finally {
    // Restore the button to its original state
    refreshBtn.innerHTML = "🔄";
    refreshBtn.disabled = false;
  }
}

async function initializeAzureDevOpsSettings() {
    await refreshSettingsUI();
}

async function refreshSettingsUI() {
    await renderOrgPatList();
    await populateOrganizationDropdowns();
}

// ✅ MODIFIED: Now displays an "Edit" button for each organization
async function renderOrgPatList() {
  const settings = await getADOSettings();
  const listDiv = document.getElementById(UI.orgPatList);
  
  let settingsArray = [];
  if (Array.isArray(settings)) {
      settingsArray = settings;
  } else if (typeof settings === 'object' && settings.organization) {
      settingsArray = [settings];
  }

  if (settingsArray.length === 0) {
      listDiv.innerHTML = '<p>No organizations saved.</p>';
      return;
  }
  
  listDiv.innerHTML = settingsArray.map(s => `
      <div class="org-pat-item">
          <span>${s.organization} (${s.assignedToName}) - Expires: ${new Date(s.expiresAt).toLocaleDateString()}</span>
          <div class="org-actions">
            <button class="edit-org-btn" data-org="${s.organization}" title="Edit">✏️</button>
            <button class="delete-org-btn" data-org="${s.organization}" title="Delete">&times;</button>
          </div>
      </div>
  `).join("");
}

// ✅ REVISED: This function now correctly retrieves settings for the selected organization.
async function addTask() {
  const date = document.getElementById(UI.taskDate).value;
  const description = document.getElementById("taskDescription").value.trim();
  const hours = Number.parseInt(document.getElementById("hours").value) || 0;
  const minutes = Number.parseInt(document.getElementById("minutes").value) || 0;

  const orgSelector = document.getElementById(UI.organizationSelect);
  const projectSelector = document.getElementById(UI.projectSelector);
  const workItemSelector = document.getElementById(UI.workItemSelector);
  const selectedOrgName = orgSelector.value;

  if (!date || !selectedOrgName || !projectSelector.value || !workItemSelector.value || !description || (hours === 0 && minutes === 0)) {
    showMessage("Please fill in all required fields and enter a time.", "error");
    return;
  }

  const newMinutes = (hours * 60) + minutes;
  if (newMinutes > (24 * 60)) {
    showMessage("A single time log cannot exceed 24 hours.", "error");
    return;
  }

  try {
    const allSettings = await getADOSettings();
    const currentOrgSettings = allSettings.find(s => s.organization === selectedOrgName);

    if (!currentOrgSettings || !currentOrgSettings.assignedToName) {
      showMessage("'Assigned To' name is not configured in settings for this organization.", "error");
      return;
    }

    const workItemId = workItemSelector.value.split(":")[1];
    const projectName = projectSelector.options[projectSelector.selectedIndex].text;
    const { workItemDetails } = await getWorkItemDetailsAndHierarchy(workItemId, selectedOrgName, projectName);

    if (workItemDetails.assignedTo && workItemDetails.assignedTo.toLowerCase() !== currentOrgSettings.assignedToName.toLowerCase()) {
        showMessage("Work item is not assigned to you. Check your 'Assigned To' name in settings.", "error");
        return;
    }

    const existingTasks = await getTasksForDate(date);
    const loggedMinutes = existingTasks.reduce((total, task) => total + (task.hours * 60) + task.minutes, 0);
    const totalMinutesLimit = 36 * 60;

    if (loggedMinutes + newMinutes > totalMinutesLimit) {
      const remainingMinutes = totalMinutesLimit - loggedMinutes;
      const remainingHours = Math.floor(remainingMinutes / 60);
      const remainingMins = remainingMinutes % 60;
      showMessage(remainingMinutes <= 0 ? "You have already logged 36 hours for this day." : `Exceeds 36-hour limit. You can only log ${remainingHours}h ${remainingMins}m more.`, "error");
      return;
    }

    const selectedWorkItem = workItemSelector.value;
    const selectedWorkItemText = workItemSelector.options[workItemSelector.selectedIndex].text;
    let workItemInfo = {};
    if (selectedWorkItem.startsWith("wi:") || selectedWorkItem.startsWith("backlog:")) {
      const [title, type] = selectedWorkItemText.split(" - ");
      workItemInfo = {
        id: workItemId,
        title: title,
        type: type,
        organization: selectedOrgName,
        project: projectName,
        projectId: projectSelector.value,
        areaPath: workItemDetails.areaPath,
      };
    }

    const newTask = {
      task: workItemInfo.title || selectedWorkItemText,
      description: description,
      workItem: workItemInfo,
      hours: hours,
      minutes: minutes,
      timestamp: new Date().toISOString(),
    };
    existingTasks.push(newTask);
    await saveTasksForDate(date, existingTasks);

    document.getElementById("hours").value = "0";
    document.getElementById("minutes").value = "0";
    document.getElementById("taskDescription").value = "";
    document.getElementById(UI.workItemSelector).value = "";

    showMessage("Time log added successfully!", "success");

    if (document.getElementById(UI.filterDate).value === date) {
      loadTasksForDate(date);
    }
  } catch (error) {
    console.error("Raw error saving task:", error);
    showMessage("Error saving task. Please check your connection and settings.", "error");
  }
}

function displayTasks(tasks, date) {
  const taskList = document.getElementById(UI.taskList);

  if (tasks.length === 0) {
    taskList.innerHTML = '<p class="no-tasks">No tasks logged for this date</p>';
    return;
  }

  taskList.innerHTML = tasks.map((task) => {
    const createdOn = new Date(task.createdOn);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isEditable =
      createdOn.toDateString() === today.toDateString() ||
      createdOn.toDateString() === yesterday.toDateString();

    const timeString = formatTime(task.hours, task.minutes);
    const orgInfo = task.workItem?.organization ? `${task.workItem.organization} - ` : "";
    const projectInfo = task.workItem?.project ? `${task.workItem.project} - ` : "";
    const workItemType = task.workItem?.type ? `[${task.workItem.type}] ` : "";
    const descriptionHTML = task.description ? `<div class="task-description">${task.description}</div>` : "";

    const actionButtons = isEditable
      ? `<div class="task-actions">
           <button class="edit-btn" data-logid="${task.logId}" title="Edit">✏️</button>
           <button class="delete-btn" data-logid="${task.logId}" data-org="${task.workItem?.organization || ''}" title="Delete">🗑️</button>
         </div>`
      : "";

    return `<div class="task-item" data-logid="${task.logId}">
              <div class="task-content">
                <div class="task-main-info">
                  <div class="task-details">${orgInfo}${projectInfo}${workItemType}${task.task}</div>
                  <div class="task-time" data-hours="${task.hours}" data-minutes="${task.minutes}">${timeString}</div>
                </div>
                ${descriptionHTML}
              </div>
              ${actionButtons}
            </div>`;
  }).join("");
}

// ... (The rest of the file remains the same)
// handleEditTask, handleSaveEdit, loadTasksForDate, applyFilters, etc.
// are all unchanged and can be omitted for brevity.
// Make sure to include the rest of the file's content after this block in your final file.

function handleEditTask(editButton) {
  const taskItem = editButton.closest('.task-item');
  taskItem.classList.add('edit-mode');

  const taskContent = taskItem.querySelector('.task-content');
  const { hours, minutes } = taskItem.querySelector('.task-time').dataset;
  const description = taskItem.querySelector('.task-description')?.textContent || '';

  const taskDetailsHTML = taskContent.querySelector('.task-main-info .task-details').innerHTML;

  taskContent.innerHTML = `
      <div class="task-details">${taskDetailsHTML}</div>
      <div class="edit-inputs">
          <span>
              <input type="number" class="edit-hours" value="${hours}" min="0" max="23">h
              <input type="number" class="edit-minutes" value="${minutes}" min="0" max="59">m
          </span>
      </div>
      <div class="edit-description">
          <textarea class="edit-desc-textarea" rows="2" placeholder="Edit description...">${description}</textarea>
      </div>
  `;

  const taskActions = taskItem.querySelector('.task-actions');
  taskActions.innerHTML = `
      <button class="save-edit-btn" data-logid="${taskItem.dataset.logid}" title="Save">💾</button>
      <button class="cancel-edit-btn" title="Cancel">❌</button>
  `;
}

// ✅ REVISED: This function now includes frontend validation for time limits before saving an edit.
async function handleSaveEdit(saveButton) {
  const date = document.getElementById(UI.filterDate).value;
  const taskItem = saveButton.closest('.task-item');
  const logIdToEdit = taskItem.dataset.logid;

  const newHours = parseInt(taskItem.querySelector('.edit-hours').value, 10) || 0;
  const newMinutes = parseInt(taskItem.querySelector('.edit-minutes').value, 10) || 0;
  const newDescription = taskItem.querySelector('.edit-desc-textarea').value.trim();

  // --- NEW: Frontend Time Validation ---

  // 1. Check if the single edited log exceeds 24 hours
  const newMinutesForThisLog = (newHours * 60) + newMinutes;
  if (newMinutesForThisLog > 1440) { // 24 hours * 60 minutes
    showMessage("A single time log cannot exceed 24 hours.", "error");
    return;
  }
  if (newMinutesForThisLog <= 0) {
    showMessage("Time cannot be zero.", "error");
    return;
  }

  // 2. Check if the total for the day exceeds 36 hours
  try {
    const allTasksForDay = await getTasksForDate(date);
    
    // Calculate the total minutes for the day, EXCLUDING the log being edited
    const existingMinutesForDay = allTasksForDay
      .filter(task => task.logId.toString() !== logIdToEdit.toString())
      .reduce((sum, task) => sum + (task.hours * 60) + task.minutes, 0);

    const newTotalMinutesForDay = existingMinutesForDay + newMinutesForThisLog;

    if (newTotalMinutesForDay > 2160) { // 36 hours * 60 minutes
      showMessage(`This change would exceed the 36-hour daily limit.`, "error");
      return;
    }
  } catch (error) {
    showMessage("Could not validate daily total. Please try again.", "error");
    console.error("Error during frontend validation:", error);
    return;
  }
  // --- End of Validation ---


  // If validation passes, proceed with saving the changes.
  try {
      const tasks = await getTasksForDate(date);
      const taskToUpdate = tasks.find(t => t.logId.toString() === logIdToEdit.toString());

      if (!taskToUpdate) {
          throw new Error("Task not found for editing");
      }

      taskToUpdate.hours = newHours;
      taskToUpdate.minutes = newMinutes;
      taskToUpdate.description = newDescription;

      if (!taskToUpdate.logId) {
          throw new Error("Log_Id not found for the task to update");
      }

      await saveTasksForDate(date, [taskToUpdate]);
      await loadTasksForDate(date);
      showMessage("Time log updated.", "success");
  } catch (error) {
      showMessage(error.message || "Error saving log.", "error");
  }
}

async function loadTasksForDate(date) {
    if (!date) return;
  try {
    const tasks = await getTasksForDate(date);
    applyFiltersToTasks(tasks, date);
  } catch (error) {
    console.error("Error loading tasks:", error);
    showMessage("Error loading tasks.", "error");
  }
}

async function applyFilters() {
    const filterDate = document.getElementById(UI.filterDate).value;
    if (filterDate) {
        const tasks = await getTasksForDate(filterDate);
        applyFiltersToTasks(tasks, filterDate);
    }
}

function applyFiltersToTasks(tasks, date) {
  const selectedOrg = document.getElementById(UI.viewOrgSelector).value;
  const projectFilterDropdown = document.getElementById(UI.viewProjectSelector);
  const selectedWorkItem = document.getElementById(UI.viewWorkItemSelector).value;

  const selectedProjectName = projectFilterDropdown.value
    ? projectFilterDropdown.options[projectFilterDropdown.selectedIndex].text
    : "";

  let filteredTasks = tasks;

  if (selectedOrg) {
    filteredTasks = filteredTasks.filter((task) => 
      task.workItem?.organization?.trim().toLowerCase() === selectedOrg.trim().toLowerCase()
    );
  }

  if (selectedProjectName && selectedProjectName !== "All projects") {
    filteredTasks = filteredTasks.filter((task) => task.workItem?.project === selectedProjectName);
  }

  if (selectedWorkItem) {
    const workItemId = parseInt(selectedWorkItem.split(":")[1], 10);
    filteredTasks = filteredTasks.filter((task) => {
      return parseInt(task.workItem?.id, 10) === workItemId;
    });
  }

  displayTasks(filteredTasks, date);
  displayDailyTotal(filteredTasks);
}

async function handleRetryClick() {
    console.log("Retry button clicked - manually detecting work item");
    const retryBtn = document.getElementById(UI.retryButton);
    try {
        retryBtn.innerHTML = "⏳";
        retryBtn.disabled = true;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) {
            showMessage("Could not access current tab", "error");
            return;
        }
        const workItemMatch = tab.url.match(/https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_workitems\/edit\/(\d+)/);
        if (!workItemMatch) {
            showMessage("Not on an Azure DevOps work item page", "error");
            return;
        }
        const [, organization, project, workItemId] = workItemMatch;
        const workItemData = {
            organization: decodeURIComponent(organization),
            project: decodeURIComponent(project),
            id: Number.parseInt(workItemId),
        };
        await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: "WORK_ITEM_DETECTED", workItem: workItemData },
                (response) => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(response)
            );
        });
        showMessage("Work item detected! Attempting to pre-select...", "success");
        await checkAndPreSelectWorkItem();
    } catch (error) {
        console.error("[v0] Error in retry button:", error);
        showMessage("Error detecting work item: " + error.message, "error");
    } finally {
        retryBtn.innerHTML = "🔄";
        retryBtn.disabled = false;
    }
}

function handleTaskListActions(e) {
  const target = e.target.closest('button');
  if (!target) return;
  const logId = target.dataset.logid;
  const org = target.dataset.org; 
  if (target.classList.contains("delete-btn")) handleDeleteTask(logId, target.dataset.org);
  else if (target.classList.contains("edit-btn")) handleEditTask(target);
  else if (target.classList.contains("save-edit-btn")) handleSaveEdit(target);
  else if (target.classList.contains("cancel-edit-btn")) handleCancelEdit();
}

async function handleDeleteTask(logId, org) {
  const date = document.getElementById(UI.filterDate).value;
  if (!date || !confirm("Are you sure you want to delete this time log?")) return;

  try {
    await deleteLog(date, logId, org);
    await loadTasksForDate(date);
    showMessage("Time log deleted.", "success");
  } catch (error) {
    console.error("[handleDeleteTask] Error:", error);
    showMessage(error.message || "Error deleting log.", "error");
  }
}

async function handleClearFilters() {
  document.getElementById(UI.viewOrgSelector).value = "";

  const projectSelector = document.getElementById(UI.viewProjectSelector);
  projectSelector.innerHTML = '<option value="">All projects</option>';
  showViewProjectSelector(false);

  const workItemSelector = document.getElementById(UI.viewWorkItemSelector);
  workItemSelector.innerHTML = `
      <option value="">All work items</option>
      <optgroup label="My Work Items" id="viewWorkItemsGroup"></optgroup>
      <optgroup label="My Backlog" id="viewBacklogGroup"></optgroup>
  `;
  showViewWorkItemSelector(false);

  await applyFilters();
}

async function handleCancelEdit() {
    await loadTasksForDate(document.getElementById(UI.filterDate).value);
}

async function loadProjects(org, selectorId) {
  const pat = await getPatForOrg(org);
  if (!pat) {
    showMessage(`PAT for ${org} not found.`, "error");
    return;
  }
  
  const loadingIndicatorId = selectorId === UI.projectSelector ? UI.projectLoading : UI.viewProjectLoading;
  showLoading(loadingIndicatorId, true);
  
  try {
    const data = await fetchProjects(pat, org);
    populateProjects(data.value, selectorId);
  } catch (error) {
    console.error(`Error loading projects for ${selectorId}:`, error);
    showMessage("Failed to load projects. Check your settings.", "error");
  } finally {
    showLoading(loadingIndicatorId, false);
  }
}

async function loadWorkItems(org, projectId, selectorId) {
  const pat = await getPatForOrg(org);
  if (!pat) {
    showMessage(`PAT for ${org} not found.`, "error");
    return;
  }

  const loadingIndicatorId = selectorId === UI.workItemSelector ? UI.workItemLoading : UI.viewWorkItemLoading;
  showLoading(loadingIndicatorId, true);
  
  try {
    const workItemsQuery = "SELECT [System.Id], [System.WorkItemType] FROM WorkItems WHERE [System.AssignedTo] = @Me ORDER BY [System.ChangedDate] DESC";
    const backlogQuery = `SELECT [System.Id], [System.WorkItemType] FROM WorkItems WHERE [System.WorkItemType] IN ('Product Backlog Item','User Story','Feature') AND [System.State] <> 'Done' AND [System.AssignedTo] = @Me ORDER BY [System.ChangedDate] DESC`;
    const [workItemsData, backlogData] = await Promise.all([
      fetchWorkItems(pat, org, projectId, workItemsQuery),
      fetchWorkItems(pat, org, projectId, backlogQuery),
    ]);
    
    populateWorkItems(workItemsData.value, backlogData.value, selectorId);
  } catch (error) {
    console.error(`Error loading work items for ${selectorId}:`, error);
    showMessage("Failed to load work items", "error");
  } finally {
    showLoading(loadingIndicatorId, false);
  }
}

function populateProjects(projects, selectorId) {
  const selector = document.getElementById(selectorId);
  const defaultOptionText = selectorId === UI.projectSelector ? "Select project..." : "All projects";
  selector.innerHTML = `<option value="">${defaultOptionText}</option>`;
  projects.forEach((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    selector.appendChild(option);
  });
}

function populateWorkItems(workItems, backlogItems, selectorId) {
  const selector = document.getElementById(selectorId);
  const workItemsGroupId = selectorId === UI.workItemSelector ? "addTaskWorkItemsGroup" : "viewWorkItemsGroup";
  const backlogGroupId = selectorId === UI.workItemSelector ? "addTaskBacklogGroup" : "viewBacklogGroup";

  const workItemsGroup = document.getElementById(workItemsGroupId);
  const backlogGroup = document.getElementById(backlogGroupId);

  workItemsGroup.innerHTML = "";
  backlogGroup.innerHTML = "";

  workItems.forEach((wi) => {
    const option = document.createElement("option");
    option.value = `wi:${wi.id}`;
    option.textContent = `${wi.fields["System.Title"]} - ${wi.fields["System.WorkItemType"]}`;
    workItemsGroup.appendChild(option);
  });

  backlogItems.forEach((item) => {
    const option = document.createElement("option");
    option.value = `backlog:${item.id}`;
    option.textContent = `${item.fields["System.Title"]} - ${item.fields["System.WorkItemType"]}`;
    backlogGroup.appendChild(option);
  });
}

function showProjectSelector(show) {
    document.getElementById(UI.projectSelectorGroup).style.display = show ? "block" : "none";
}

function showWorkItemSelector(show) {
    document.getElementById(UI.workItemSelectorGroup).style.display = show ? "block" : "none";
}

function showViewProjectSelector(show) {
    document.getElementById(UI.viewProjectSelectorGroup).style.display = show ? "block" : "none";
}

function showViewWorkItemSelector(show) {
    document.getElementById(UI.viewWorkItemSelectorGroup).style.display = show ? "block" : "none";
}

async function checkAndPreSelectWorkItem() {
  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "GET_CURRENT_WORK_ITEM" }, (response) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(response);
      });
    });
    if (response && response.id) {
      await preSelectWorkItem(response);
    }
  } catch (error) {
    console.error("[v0] Error checking current work item:", error);
  }
}

async function preSelectWorkItem(workItem) {
  try {
    const orgSelector = document.getElementById(UI.organizationSelect);
    orgSelector.value = workItem.organization;

    const pat = await getPatForOrg(workItem.organization);
    if (!pat) {
      showMessage("PAT not configured for this organization - cannot auto-select work item", "error");
      return;
    }
    if (!workItem.organization || !workItem.project || !workItem.id) {
      showMessage("Incomplete work item data for auto-selection", "error");
      return;
    }

    await loadProjects(workItem.organization, UI.projectSelector);
    const projectSelector = document.getElementById(UI.projectSelector);
    let projectId;
    for (const option of projectSelector.options) {
      if (option.textContent.toLowerCase() === workItem.project.toLowerCase()) {
        projectSelector.value = option.value;
        projectId = option.value;
        break;
      }
    }
    if (!projectId) {
      showMessage(`Project "${workItem.project}" not found or not accessible`, "error");
      return;
    }

    await loadWorkItems(workItem.organization, projectId, UI.workItemSelector);
    const workItemSelector = document.getElementById(UI.workItemSelector);
    for (const option of workItemSelector.options) {
      if (option.value === `wi:${workItem.id}` || option.value === `backlog:${workItem.id}`) {
        workItemSelector.value = option.value;
        showMessage(`Auto-selected: Work Item ${workItem.id}`, "success");
        break;
      }
    }
  } catch (error) {
    console.error("[v0] Error pre-selecting work item:", error);
    showMessage("Error auto-selecting work item", "error");
  }
}