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