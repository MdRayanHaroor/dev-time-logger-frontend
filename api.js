// api.js

function getAuthHeaders(pat) {
  return {
    Authorization: `Basic ${btoa(":" + pat)}`,
    Accept: "application/json",
  };
}

async function fetchProjects(pat, org) {
  const response = await fetch(`https://dev.azure.com/${org}/_apis/projects?api-version=7.0`, {
    headers: getAuthHeaders(pat),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function fetchWorkItems(pat, org, projectId, query) {
  const wiqlQuery = { query };

  const wiqlResponse = await fetch(`https://dev.azure.com/${org}/${projectId}/_apis/wit/wiql?api-version=7.0`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(pat),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(wiqlQuery),
  });

  if (!wiqlResponse.ok) {
    throw new Error(`WIQL query failed: ${wiqlResponse.status}`);
  }

  const wiqlData = await wiqlResponse.json();
  // The ADO API limit for getting work items by ID is 200.
  // This ensures we don't exceed that limit.
  const workItemIds = wiqlData.workItems.map((wi) => wi.id).slice(0, 200);

  if (workItemIds.length > 0) {
    const detailsResponse = await fetch(
      `https://dev.azure.com/${org}/_apis/wit/workitems?ids=${workItemIds.join(",")}&api-version=7.0`,
      {
        headers: getAuthHeaders(pat),
      }
    );

    if (detailsResponse.ok) {
      return detailsResponse.json();
    }
  }
  return { value: [] };
}

// 🆕 ADDED: New function to fetch total time for a specific work item
async function fetchWorkItemTotalTime(pat, org, workItemId
  // , assignedToName
) {
  console.log("Fetching total time for Work Item:", workItemId, "Organization:", org);
  const response = await fetch(
    // 🎯 Use the new Azure Function endpoint
    //`https://timesheet-plugin-js-fzhee9g0h0e9ergz.centralindia-01.azurewebsites.net/api/getTotalLog?workItemId=${workItemId}&assignedTo=${assignedToName}&organization=${org}`,
    // `http://localhost:7071/api/getTotalLog?workItemId=${workItemId}&organization=${org}`,
    `https://timesheet-plugin-js-fzhee9g0h0e9ergz.centralindia-01.azurewebsites.net/api/getTotalLog?workItemId=${workItemId}&organization=${org}`,
    {
      method: "GET",
      headers: getAuthHeaders(pat),
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: Failed to fetch total time.`);
  }

  // The API is expected to return a payload like: { totalMinutes: 450 }
  const data = await response.json();
  return data;
}

export { fetchProjects, fetchWorkItems, fetchWorkItemTotalTime };