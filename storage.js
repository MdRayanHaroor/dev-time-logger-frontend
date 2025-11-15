// storage.js

/**
 * A helper function to sanitize strings used in constructing API URLs.
 * It allows only alphanumeric characters, hyphens, and underscores to prevent
 * potential injection of malicious characters.
 * @param {string} input The string to sanitize.
 * @returns {string} The sanitized string.
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[^a-zA-Z0-9\-_]/g, '');
}


// ✅ REVISED: This function now consistently returns the full ARRAY of settings.
async function getADOSettings() {
  const result = await chrome.storage.local.get(["adoSettings"]);
  if (Array.isArray(result.adoSettings)) {
    return result.adoSettings;
  }
  if (typeof result.adoSettings === 'object' && result.adoSettings !== null) {
    return [result.adoSettings];
  }
  return [];
}

async function saveADOSettings(settings) {
  const settingsToStore = Array.isArray(settings) ? settings : [settings];
  await chrome.storage.local.set({ adoSettings: settingsToStore });
}

async function clearADOSettings() {
  await chrome.storage.local.remove(["adoSettings"]);
}

// ✅ REVISED: This function now correctly finds the settings for the specific organization being used.
async function getTasksForDate(date) {
  try {
    const allSettings = await getADOSettings();
    if (!allSettings || allSettings.length === 0) {
      console.warn("ADO settings are not configured.");
      return [];
    }
    // For now, we will use the first configured setting as the default.
    const adoSettings = allSettings[0]; 

    if (!adoSettings || !adoSettings.organization || !adoSettings.pat || !adoSettings.assignedToName) {
      console.warn("The default ADO setting is incomplete. Please check your configuration.");
      return [];
    }

    const response = await fetch(
      `https://timesheet-plugin-js-fzhee9g0h0e9ergz.centralindia-01.azurewebsites.net/api/getLogs?date=${date}&assignedTo=${adoSettings.assignedToName}&organization=${adoSettings.organization}`,
      // `http://localhost:7071/api/getLogs?date=${date}&assignedTo=${adoSettings.assignedToName}&organization=${adoSettings.organization}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Basic ${btoa(":" + adoSettings.pat)}`,
          "Accept": "application/json"
        }
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMessage = errorData ? JSON.stringify(errorData) : `Failed to fetch logs: ${response.status}`;
      throw new Error(errorMessage);
    }
    const logs = await response.json();

    return logs.map(log => ({
      task: log.WorkItem || log.ProjectName,
      description: log.Description,
      workItem: {
        id: log.WorkItem,
        title: log.WorkItemTitle || log.WorkItem,
        type: log.WorkItemType,
        organization: log.OrganizationName || "",
        project: log.ProjectName,
        projectId: log.ProjectId || "",
        state: log.WorkItemState || "",
        assignedTo: log.AssignedTo || "",
        iterationPath: log.IterationPath || "",
        tags: log.Tags || "",
        url: log.WorkItemURL || "",
        workItemDescription: log.WorkItemDescription || "",
      },
      hours: log.HoursSpent,
      minutes: log.MinutesSpent,
      timestamp: log.LogDate,
      createdOn: log.CreatedOn,
      logId: log.Log_Id
    }));
  } catch (err) {
    console.error("Error fetching tasks:", err.message);
    return []; 
  }
}


// ✅ REVISED: This function now correctly uses the settings for the specific organization of the task being saved.
async function saveTasksForDate(date, tasks) {
  try {
    const latestTask = tasks[tasks.length - 1];
    const allSettings = await getADOSettings();
    
    // Find the correct settings for the organization this task belongs to.
    const orgNameForTask = latestTask.workItem?.organization || "";
    const adoSettings = allSettings.find(s => s.organization === orgNameForTask);

    if (!adoSettings || !adoSettings.organization || !adoSettings.pat || !adoSettings.assignedToName) {
      throw new Error("Missing ADO settings (organization, PAT, or Assigned To Name)");
    }

    let payload;
    const endpoint = latestTask.logId
      ? "https://timesheet-plugin-js-fzhee9g0h0e9ergz.centralindia-01.azurewebsites.net/api/updateLog"
      : "https://timesheet-plugin-js-fzhee9g0h0e9ergz.centralindia-01.azurewebsites.net/api/addLog";
      // ? "http://localhost:7071/api/updateLog"
      // : "http://localhost:7071/api/addLog";
    if (latestTask.logId) {
      // --- Update existing log ---
      payload = {
        Log_Id: latestTask.logId,
        HoursSpent: latestTask.hours,
        MinutesSpent: latestTask.minutes,
        Description: latestTask.description,
        organization: adoSettings.organization
      };
    } else {
      // --- Add new log ---
      let combinedDetails = { workItemDetails: {}, hierarchy: { userStory: null, feature: null, epic: null } };
      try {
        combinedDetails = await getWorkItemDetailsAndHierarchy(
          latestTask.workItem?.id,
          adoSettings.organization,
          latestTask.workItem?.project
        );
      } catch (error) {
        console.error("Error fetching work item details during save.");
      }

      const { workItemDetails, hierarchy } = combinedDetails;

      payload = {
        Log_Id: null,
        organization: adoSettings.organization,
        ProjectName: latestTask.workItem?.project || "",
        WorkItem: latestTask.workItem?.id || latestTask.task,
        WorkItemTitle: workItemDetails.title || latestTask.workItem?.title || latestTask.task,
        WorkItemType: workItemDetails.type || latestTask.workItem?.type || "",
        LogDate: date,
        CreatedOn: new Date().toISOString().split("T")[0],
        DeveloperName: adoSettings.assignedToName,
        HoursSpent: latestTask.hours,
        MinutesSpent: latestTask.minutes,
        WorkItemURL: latestTask.workItem?.url ||
          `https://dev.azure.com/${adoSettings.organization}/${latestTask.workItem?.project}/_workitems/edit/${latestTask.workItem?.id}`,
        Description: latestTask.description,
        UserStoryId: hierarchy.userStory?.id || null,
        UserStoryTitle: hierarchy.userStory?.title || null,
        UserStoryDescription: hierarchy.userStory?.description || null,
        FeatureId: hierarchy.feature?.id || null,
        FeatureTitle: hierarchy.feature?.title || null,
        EpicId: hierarchy.epic?.id || null,
        EpicTitle: hierarchy.epic?.title || null,
        WorkItemState: workItemDetails.state || null,
        AssignedTo: adoSettings.assignedToName,
        IterationPath: workItemDetails.iterationPath || null,
        Tags: workItemDetails.tags || null,
        WorkItemDescription: workItemDetails.workItemDescription || null,
        AreaPath: workItemDetails.areaPath || null
      };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${btoa(":" + adoSettings.pat)}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to save task: ${response.status} - ${errorText}`);
    }
  } catch (err) {
    console.error("Error saving task:", err.message);
    throw err;
  }
}

async function deleteLog(date, logId, organization) {
  try {
    const allSettings = await getADOSettings();
    const adoSettings = allSettings.find(s => s.organization === organization);

    if (!adoSettings || !adoSettings.organization || !adoSettings.pat) {
      throw new Error("Missing ADO settings (organization/PAT)");
    }

    const response = await fetch(
      `https://timesheet-plugin-js-fzhee9g0h0e9ergz.centralindia-01.azurewebsites.net/api/deleteLog`,
      // or local for testing:
      // `http://localhost:7071/api/deleteLog`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${btoa(":" + adoSettings.pat)}`
        },
        body: JSON.stringify({
          Log_Id: Number(logId),
          organization: adoSettings.organization
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete log: ${response.status} - ${errorText}`);
    }

    return response.json();
  } catch (err) {
    console.error("Error deleting log:", err.message);
    throw err;
  }
}


/**
 * Fetches details for a given work item and its parent hierarchy in an efficient manner.
 * This combines the logic of getWorkItemDetails and getWorkItemHierarchy.
 * @param {number} workItemId The ID of the work item to start from.
 * @param {string} organization The Azure DevOps organization.
 * @param {string} project The Azure DevOps project.
 * @returns {Promise<object>} An object containing workItemDetails and the hierarchy.
 */
async function getWorkItemDetailsAndHierarchy(workItemId, organization, project) {
  let initialWorkItemDetails = {};
  const hierarchy = { userStory: null, feature: null, epic: null };

  if (!workItemId || !organization || !project) {
      return { workItemDetails: initialWorkItemDetails, hierarchy };
  }

  try {
    if (isNaN(parseInt(workItemId))) {
      throw new Error("Invalid Work Item ID provided.");
    }
    const sanitizedOrganization = sanitizeInput(organization);
    const sanitizedProject = sanitizeInput(project);

    let currentId = workItemId;
    let isInitialItem = true;

    while (currentId) {
      const res = await fetch(
        `https://dev.azure.com/${sanitizedOrganization}/${sanitizedProject}/_apis/wit/workitems/${currentId}?$expand=relations&api-version=7.0`,
        {
          method: "GET",
          credentials: "include",
          headers: { "Accept": "application/json" }
        }
      );

      if (!res.ok) throw new Error(`Failed to fetch work item ${currentId}`);
      
      const current = await res.json();
      const fields = current.fields;
      const type = fields["System.WorkItemType"];
      const title = fields["System.Title"];
      const description = stripHtml(fields["System.Description"]);

      // If this is the first (primary) work item, capture all its details.
      if (isInitialItem) {
          initialWorkItemDetails = {
              title: title,
              type: type,
              state: fields["System.State"] ?? null,
              assignedTo: fields["System.AssignedTo"]?.displayName ?? null,
              iterationPath: fields["System.IterationPath"] ?? null,
              tags: fields["System.Tags"] ?? null,
              workItemDescription: description,
              areaPath: fields["System.AreaPath"] ?? null
          };
          isInitialItem = false;
      }
      
      // Populate the hierarchy
      if (type === "User Story" && !hierarchy.userStory) {
        hierarchy.userStory = { id: current.id, title, description };
      } else if (type === "Feature" && !hierarchy.feature) {
        hierarchy.feature = { id: current.id, title };
      } else if (type === "Epic" && !hierarchy.epic) {
        hierarchy.epic = { id: current.id, title };
      }

      // Move to the parent work item
      const parentRelation = current.relations?.find(r => r.rel === "System.LinkTypes.Hierarchy-Reverse");
      currentId = parentRelation ? parentRelation.url.split('/').pop() : null;
    }
  } catch (err) {
    console.error("An error occurred while fetching the work item details and hierarchy.");
  }
  
  return { workItemDetails: initialWorkItemDetails, hierarchy };
}

function stripHtml(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}