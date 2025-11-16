// ui.js

/**
 * Displays a success or error message to the user in a dedicated container.
 * @param {string} message The message to display.
 * @param {string} type The type of message ('success' or 'error').
 */
function showMessage(message, type) {
  const messageContainer = document.getElementById("message-container");
  if (!messageContainer) return;

  // Set the message and style
  messageContainer.textContent = message;
  messageContainer.className = type === "success" ? "success-message" : "error-message";

  // Add the 'visible' class to slide it into view
  messageContainer.classList.add("visible");

  // After 3 seconds, remove the 'visible' class to slide it out
  setTimeout(() => {
    messageContainer.classList.remove("visible");
  }, 3000);
}

/**
 * Formats a given number of hours and minutes into a string like "1h 30m".
 * @param {number} hours The number of hours.
 * @param {number} minutes The number of minutes.
 * @returns {string} The formatted time string.
 */
function formatTime(hours, minutes) {
    const totalMinutes = hours * 60 + minutes;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h ${m}m`;
}

/**
 * Calculates and displays the total time for a given list of tasks.
 * @param {Array<object>} tasks The list of tasks.
 */
function displayDailyTotal(tasks) {
  const totalMinutes = tasks.reduce((sum, task) => sum + (task.hours * 60) + task.minutes, 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const totalTimeString = formatTime(hours, minutes);
  const totalElement = document.querySelector("#dailyTotal strong");
  if (totalElement) {
    totalElement.textContent = `Total Time Spent - ${totalTimeString}`;
  }
}

/**
 * Renders the list of tasks in the UI.
 * @param {Array<object>} tasks The list of tasks to display.
 */
function displayTasks(tasks) {
  const taskList = document.getElementById("taskList");

  if (tasks.length === 0) {
    taskList.innerHTML = '<p class="no-tasks">No tasks logged for this date</p>';
    return;
  }

  const taskItems = tasks
    .map((task) => {
      const timeString = formatTime(task.hours, task.minutes);
      const orgInfo = task.workItem?.organization ? `${task.workItem.organization} - ` : "";
      const projectInfo = task.workItem?.project ? `${task.workItem.project} - ` : "";
      const workItemType = task.workItem?.type ? `[${task.workItem.type}] ` : "";
      return `<div class="task-item">${orgInfo}${projectInfo}${workItemType}${task.task} - ${timeString}</div>`;
    })
    .join("");

  taskList.innerHTML = taskItems;
}

/**
 * Toggles the visibility of a Personal Access Token (PAT) input field.
 */
function togglePATVisibility() {
  const patInput = document.getElementById("pat");
  const toggleBtn = document.getElementById("togglePat");

  if (patInput.type === "password") {
    patInput.type = "text";
    toggleBtn.textContent = "🙈";
  } else {
    patInput.type = "password";
    toggleBtn.textContent = "👁";
  }
}

/**
 * Shows or hides a loading indicator.
 * @param {string} elementId The ID of the loading indicator element.
 * @param {boolean} show True to show the indicator, false to hide it.
 */
function showLoading(elementId, show) {
  const element = document.getElementById(elementId);
  if (element) {
    element.style.display = show ? "block" : "none";
  }
}

export {
  showMessage,
  formatTime,
  displayDailyTotal,
  displayTasks,
  togglePATVisibility,
  showLoading
};