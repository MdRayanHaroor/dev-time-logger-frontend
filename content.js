// content.js
;(() => {
  let observer;

  const extractWorkItemInfo = () => {
    const url = window.location.href;
    const workItemMatch = url.match(/https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_workitems\/edit\/(\d+)/);

    if (workItemMatch) {
      const [, org, project, workItemId] = workItemMatch;
      const titleElement = document.querySelector('input[aria-label="Title"]');
      
      // Ensure the title element is present before proceeding
      if (titleElement) {
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
    // Disconnect any previous observer before starting a new one
    if (observer) {
      observer.disconnect();
    }
    
    // First, check if the URL is not a work item page
    if (!window.location.href.includes("/_workitems/edit/")) {
      clearWorkItem();
      return;
    }

    // If the title element is already there, use it immediately.
    if (document.querySelector('input[aria-label="Title"]')) {
      extractWorkItemInfo();
      return;
    }

    // Otherwise, observe the DOM for the title element to appear.
    observer = new MutationObserver((mutations, obs) => {
      if (document.querySelector('input[aria-label="Title"]')) {
        extractWorkItemInfo();
        obs.disconnect(); // Stop observing once found
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

  runDetection();
})();