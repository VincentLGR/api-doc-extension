// Éléments du DOM
const apiTitleElement = document.getElementById('apiTitle');
const apiUrlElement = document.getElementById('apiUrl');
const apiMethodElement = document.getElementById('apiMethod');
const apiTimestampElement = document.getElementById('apiTimestamp');
const apiStatusElement = document.getElementById('apiStatus');
const requestHeadersElement = document.getElementById('requestHeaders');
const requestBodyElement = document.getElementById('requestBody');
const responseHeadersElement = document.getElementById('responseHeaders');
const responseBodyElement = document.getElementById('responseBody');
const exportButton = document.getElementById('exportButton');
const closeButton = document.getElementById('closeButton');

// Variables globales
let currentApi = null;
let currentApiId = null;

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
  // Obtenir l'ID de l'API à afficher
  chrome.storage.local.get(['currentApiId', 'capturedApis'], (result) => {
    if (result.currentApiId && result.capturedApis && result.capturedApis[result.currentApiId]) {
      currentApiId = result.currentApiId;
      currentApi = result.capturedApis[currentApiId];
      displayApiDetails();
    } else {
      showError("API non trouvée");
    }
  });
});

// Gestionnaires d'événements
exportButton.addEventListener('click', () => {
  exportApiDetails();
});

closeButton.addEventListener('click', () => {
  window.close();
});

// Afficher les détails de l'API
function displayApiDetails() {
  if (!currentApi) return;
  
  // Définir le titre
  document.title = `API: ${formatUrl(currentApi.url)}`;
  apiTitleElement.textContent = `${currentApi.method} ${formatUrl(currentApi.url)}`;
  
  // Informations générales
  apiUrlElement.textContent = currentApi.url;
  
  // Méthode avec badge coloré
  const methodSpan = document.createElement('span');
  methodSpan.className = `method method-${currentApi.method.toLowerCase()}`;
  methodSpan.textContent = currentApi.method;
  apiMethodElement.appendChild(methodSpan);
  
  // Timestamp
  apiTimestampElement.textContent = formatDate(currentApi.timestamp);
  
  // Code de statut avec badge coloré
  if (currentApi.statusCode) {
    const statusSpan = document.createElement('span');
    const statusClass = getStatusClass(currentApi.statusCode);
    statusSpan.className = `status ${statusClass}`;
    statusSpan.textContent = currentApi.statusCode;
    apiStatusElement.appendChild(statusSpan);
  } else {
    apiStatusElement.textContent = 'N/A';
  }
  
  // En-têtes de requête
  displayHeaders(requestHeadersElement, currentApi.requestHeaders);
  
  // Corps de la requête
  displayRequestBody(requestBodyElement, currentApi.requestBody);
  
  // En-têtes de réponse
  displayHeaders(responseHeadersElement, currentApi.responseHeaders);
  
  // Corps de la réponse
  if (currentApi.responseBody) {
    displayJsonOrText(responseBodyElement, currentApi.responseBody);
  } else {
    responseBodyElement.textContent = 'Corps de réponse non disponible';
  }
}

// Fonctions d'affichage
function displayHeaders(element, headers) {
  if (!headers || Object.keys(headers).length === 0) {
    element.textContent = 'Aucun en-tête disponible';
    return;
  }
  
  const formattedHeaders = Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  
  element.textContent = formattedHeaders;
}

function displayRequestBody(element, body) {
  if (!body) {
    element.textContent = 'Aucun corps de requête';
    return;
  }
  
  if (body.type === 'formData') {
    // Afficher les données de formulaire
    const formattedData = Object.entries(body.content)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    element.textContent = formattedData;
  } else if (body.type === 'raw') {
    // Afficher le corps brut (tenter de formater en JSON si possible)
    displayJsonOrText(element, body.content);
  } else {
    element.textContent = body.content || 'Corps de requête non lisible';
  }
}

function displayJsonOrText(element, text) {
  if (!text) {
    element.textContent = 'Aucune donnée';
    return;
  }
  
  try {
    // Tenter de parser en tant que JSON
    const parsed = JSON.parse(text);
    element.textContent = JSON.stringify(parsed, null, 2);
  } catch (e) {
    // Afficher en tant que texte brut si ce n'est pas du JSON
    element.textContent = text;
  }
}

// Exporter les détails de l'API
function exportApiDetails() {
  if (!currentApi) return;
  
  // Générer un document Markdown
  let markdown = `# ${currentApi.method} ${formatUrl(currentApi.url)}\n\n`;
  markdown += `**URL:** ${currentApi.url}\n`;
  markdown += `**Méthode:** ${currentApi.method}\n`;
  markdown += `**Timestamp:** ${formatDate(currentApi.timestamp)}\n`;
  markdown += `**Code de statut:** ${currentApi.statusCode || 'N/A'}\n\n`;
  
  // En-têtes de requête
  markdown += "## En-têtes de requête\n\n```\n";
  markdown += formatObjectAsText(currentApi.requestHeaders);
  markdown += "\n```\n\n";
  
  // Corps de la requête
  markdown += "## Corps de la requête\n\n```json\n";
  if (currentApi.requestBody) {
    if (currentApi.requestBody.type === 'formData') {
      markdown += formatObjectAsText(currentApi.requestBody.content);
    } else if (currentApi.requestBody.type === 'raw') {
      markdown += formatJsonOrText(currentApi.requestBody.content);
    } else {
      markdown += "Aucun corps ou format non pris en charge";
    }
  } else {
    markdown += "Aucun corps de requête";
  }
  markdown += "\n```\n\n";
  
  // En-têtes de réponse
  markdown += "## En-têtes de réponse\n\n```\n";
  markdown += formatObjectAsText(currentApi.responseHeaders);
  markdown += "\n```\n\n";
  
  // Corps de la réponse
  markdown += "## Corps de la réponse\n\n```json\n";
  if (currentApi.responseBody) {
    markdown += formatJsonOrText(currentApi.responseBody);
  } else {
    markdown += "Corps de réponse non disponible";
  }
  markdown += "\n```\n";
  
  // Créer un blob et un lien de téléchargement
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `api-${currentApiId}-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a);
  a.click();
  
  // Nettoyer
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

// Afficher une erreur
function showError(message) {
  apiTitleElement.textContent = "Erreur";
  document.body.innerHTML = `
    <div class="container">
      <div class="error-message">
        <h2>Erreur</h2>
        <p>${message}</p>
        <button id="closeErrorButton" class="btn">Fermer</button>
      </div>
    </div>
  `;
  
  document.getElementById('closeErrorButton').addEventListener('click', () => {
    window.close();
  });
}

// Fonctions utilitaires
function formatUrl(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.pathname}${urlObj.search}`;
  } catch (e) {
    return url;
  }
}

function formatDate(timestamp) {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString();
  } catch (e) {
    return timestamp || 'N/A';
  }
}

function formatObjectAsText(obj) {
  if (!obj || Object.keys(obj).length === 0) return 'N/A';
  return Object.entries(obj)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

function formatJsonOrText(text) {
  if (!text) return 'N/A';
  
  try {
    // Tenter de parser en tant que JSON
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch (e) {
    // Retourner en tant que texte brut si ce n'est pas du JSON
    return text;
  }
}

function getStatusClass(statusCode) {
  const code = parseInt(statusCode, 10);
  if (code >= 200 && code < 300) {
    return 'status-2xx';
  } else if (code >= 300 && code < 400) {
    return 'status-3xx';
  } else if (code >= 400 && code < 500) {
    return 'status-4xx';
  } else if (code >= 500) {
    return 'status-5xx';
  }
  return '';
} 