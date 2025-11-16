// content.js
;(() => {
  let observer;

  // 🆕 ADDED: Import storage helper and formatTime
  const storage = chrome.runtime.getURL("storage.js");
  const ui = chrome.runtime.getURL("ui.js");

  // Dynamically import functions from storage.js and ui.js
  let getWorkItemTotalTime;
  let formatTime;

  Promise.all([import(storage), import(ui)]).then(([storageModule, uiModule]) => {
    
    getWorkItemTotalTime = storageModule.getWorkItemTotalTime;
    formatTime = uiModule.formatTime;
    
    // Rerun detection after imports are complete
    runDetection();
  }).catch(error => {
    console.error("❌ Failed to load modules:", error);
  });

  // --- Reliable title finder ---
  function getTitleElement() {
    // Try more specific selectors first
    const selectors = [
      'input[aria-label="Title field"]', // Most specific - your case
      'input[aria-label="Title"]',
      'textarea[aria-label="Title"]', 
      'input[placeholder="Enter title"]',
      'div[role="textbox"][data-placeholder="Title"]'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }
    
    return null;
  }

// --- Stable container finder ---
function getTitleContainer() {
  const title = getTitleElement();
  if (!title) return null;

  return (
    title.closest('.work-item-form-header') ||
    title.closest('.bolt-textfield') ||
    title.parentElement
  );
}

// --- Safe renderer ---
function renderLoggedTime(container, formattedTime) {
  let display = container.querySelector('#logged-time-display');

  if (!display) {
    display = document.createElement('span');
    display.id = 'logged-time-display';
    display.style.cssText = `
      font-weight: 600;
      font-size: 14px;
      margin-left: 12px;
      color: #0078d4;
      white-space: nowrap;
    `;
    container.appendChild(display);
  }

  display.textContent = `(Logged time - ${formattedTime})`;
}


  const extractWorkItemInfo = async () => {
    const url = window.location.href;
    const workItemMatch = url.match(/https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_workitems\/edit\/(\d+)/);

    if (workItemMatch) {
      const [, org, project, workItemId] = workItemMatch;
      // 🎯 MODIFIED: Selector now correctly targets 'Title field'
      const titleElement = getTitleElement();
      const titleContainer = getTitleContainer();

      // Ensure the title element is present before proceeding
      if (titleElement && titleContainer) { // ⬅️ Check if container is found
        const workItemTitle = titleElement.value || `Work Item ${workItemId}`;
        const workItemInfo = {
          id: Number.parseInt(workItemId),
          title: workItemTitle,
          organization: decodeURIComponent(org),
          project: decodeURIComponent(project),
          url: `https://dev.azure.com/${org}/${project}/_workitems/edit/${workItemId}`
        };

        chrome.runtime.sendMessage({
          type: "WORK_ITEM_DETECTED",
          workItem: workItemInfo,
        });

        // --- 🆕 ADDED: Fetch and Display Logged Time ---
        if (getWorkItemTotalTime && formatTime) {
                    try {
                        const { hours, minutes } = await getWorkItemTotalTime(workItemInfo.id, workItemInfo.organization);
                            
                        // 🎯 Use the separated hours and minutes for formatting
                        const formattedTime = formatTime(hours, minutes);
          
                        // Check if the element already exists to prevent duplicates
                        renderLoggedTime(titleContainer, formattedTime);
                        
                    } catch (e) {
                        console.error("Failed to display logged time on ADO page:", e);
                    }
                  }
        
        // Disconnect the observer once we've found what we need
        if (observer) {
          observer.disconnect();
        }
        return true;
      }
    }
    return false;
  };

  const clearWorkItem = () => {
    chrome.runtime.sendMessage({ type: "CLEAR_WORK_ITEM" });
  };

  const runDetection = () => {
    // Ensure the necessary functions are available
    if (!getWorkItemTotalTime || !formatTime) {
      return;
    }

    // Disconnect any previous observer before starting a new one
    if (observer) {
      observer.disconnect();
    }
    
    // First, check if the URL is not a work item page
    if (!window.location.href.includes("/_workitems/edit/")) {
      console.log("Not a work item page");
      clearWorkItem();
      const timeDisplay = document.getElementById('logged-time-display');
      if (timeDisplay) timeDisplay.remove();
      return;
    }    
  
    // Test the title element finder
    const titleElement = getTitleElement();    
    
    if (titleElement) {
      const titleContainer = getTitleContainer();      
    }
  
    // If the title element is already there, use it immediately.
    if (titleElement) {      
      extractWorkItemInfo();
      return;
    }
  
    // Otherwise, observe the DOM for the title element to appear.
    observer = new MutationObserver((mutations, obs) => {
      const titleElement = getTitleElement();
      if (titleElement) {
        extractWorkItemInfo();
        obs.disconnect();
      }
    });
  
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "RUN_DETECTION") {
      runDetection();
      sendResponse({ success: true });
    }
    return true;
  });

  //runDetection();
})();