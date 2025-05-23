// Éléments du DOM
let toggleButton;
let generateButton;
let generateIcon;
let generateText;
let clearButton;
let selectAllButton;
let deselectAllButton;
let statusElement;
let apiListElement;
let apiItemsElement;
let statusMessage;
let downloadSection;
let downloadButton;
let downloadStatus;
let docButton;
let docOptionsElement;
let includeOnlyWithResponseCheckbox;
let groupByEndpointCheckbox;
let includeExamplesCheckbox;
let outputFormatSelect;
let docTitleInput;
let docSubtitleInput;
let generateDocButton;
let cancelDocButton;

// Variables globales
let isMonitoring = false;
let capturedApis = {};
let isExporting = false;
let docGenerator = new window.DocGenerator();
let generatedDocumentation = null;

// Fonctions utilitaires pour l'interface
function showLoading(button, text) {
  if (!button || !generateIcon || !generateText) return;
  button.disabled = true;
  generateIcon.className = 'loading';
  generateText.textContent = text;
}

function hideLoading(button, text) {
  if (!button || !generateIcon || !generateText) return;
  button.disabled = false;
  generateIcon.className = '';
  generateText.textContent = text;
}

function showStatus(message, type = 'info') {
  if (!statusMessage) return;
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.style.display = 'block';
}

function hideStatus() {
  if (!statusMessage) return;
  statusMessage.style.display = 'none';
}

function showDownloadSection() {
  if (!downloadSection) return;
  downloadSection.classList.add('visible');
}

function hideDownloadSection() {
  if (!downloadSection) return;
  downloadSection.classList.remove('visible');
}

// Mettre à jour le statut
function updateStatus(isMonitoring) {
  console.log('Mise à jour du statut:', isMonitoring);
  if (!statusElement || !toggleButton) return;
  
  statusElement.textContent = isMonitoring ? 'Actif' : 'Inactif';
  statusElement.className = `status ${isMonitoring ? 'active' : 'inactive'}`;
  toggleButton.textContent = isMonitoring ? 'Arrêter la capture' : 'Démarrer la capture';
  toggleButton.disabled = false;
}

// Mettre à jour la liste des APIs
function updateApiList(apis) {
  if (!apiListElement) return;
  
  apiListElement.innerHTML = '';
  
  // Convertir l'objet en tableau avec les IDs
  docGenerator.apis = Object.entries(apis).map(([id, api]) => ({
    ...api,
    id: id
  }));

  // Map pour garder une trace des URLs déjà vues
  const urlSelectionMap = {};

  Object.entries(apis).forEach(([id, api]) => {
    const apiItem = document.createElement('div');
    apiItem.className = 'api-item';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = docGenerator.selectedApis.has(id);
    
    // Stocker l'URL dans le map pour la synchronisation
    if (api.url && !urlSelectionMap[api.url]) {
      urlSelectionMap[api.url] = {
        ids: [id],
        isSelected: checkbox.checked
      };
    } else if (api.url) {
      urlSelectionMap[api.url].ids.push(id);
    }
    
    checkbox.addEventListener('change', () => {
      // Si cette URL existe dans d'autres APIs, synchroniser la sélection
      if (api.url && urlSelectionMap[api.url]) {
        const isSelected = checkbox.checked;
        
        // Mettre à jour toutes les APIs avec la même URL
        urlSelectionMap[api.url].ids.forEach(apiId => {
          if (isSelected) {
            docGenerator.selectedApis.add(apiId);
          } else {
            docGenerator.selectedApis.delete(apiId);
          }
          
          // Mettre à jour les autres checkbox avec la même URL
          document.querySelectorAll(`input[data-id="${apiId}"]`).forEach(cb => {
            cb.checked = isSelected;
          });
        });
        
        urlSelectionMap[api.url].isSelected = isSelected;
      } else {
        // Comportement normal pour les URLs uniques
        if (checkbox.checked) {
          docGenerator.selectedApis.add(id);
        } else {
          docGenerator.selectedApis.delete(id);
        }
      }
      
      updateGenerateButton();
    });
    
    // Ajouter un attribut data-id pour identifier facilement le checkbox
    checkbox.setAttribute('data-id', id);

    const apiInfo = document.createElement('div');
    apiInfo.className = 'api-info';
    
    const method = document.createElement('span');
    method.className = 'api-method';
    method.textContent = api.method;
    
    const path = document.createElement('span');
    path.className = 'api-path';
    path.textContent = api.path || api.url;

    apiInfo.appendChild(method);
    apiInfo.appendChild(path);
    
    apiItem.appendChild(checkbox);
    apiItem.appendChild(apiInfo);
    apiListElement.appendChild(apiItem);
  });

  updateGenerateButton();
}

// Mettre à jour l'état du bouton de génération
function updateGenerateButton() {
  if (!generateButton) return;
  generateButton.disabled = docGenerator.selectedApis.size === 0;
}

// Initialisation
function initializeElements() {
  toggleButton = document.getElementById('toggleMonitoring');
  generateButton = document.getElementById('generateDoc');
  generateIcon = document.getElementById('generateIcon');
  generateText = document.getElementById('generateText');
  clearButton = document.getElementById('clearApis');
  selectAllButton = document.getElementById('selectAll');
  deselectAllButton = document.getElementById('deselectAll');
  statusElement = document.getElementById('status');
  apiListElement = document.getElementById('apiList');
  apiItemsElement = document.getElementById('apiItems');
  statusMessage = document.getElementById('statusMessage');
  downloadSection = document.getElementById('downloadSection');
  downloadButton = document.getElementById('downloadButton');
  downloadStatus = document.getElementById('downloadStatus');
  docButton = document.getElementById('docButton');
  docOptionsElement = document.getElementById('docOptions');
  includeOnlyWithResponseCheckbox = document.getElementById('includeOnlyWithResponse');
  groupByEndpointCheckbox = document.getElementById('groupByEndpoint');
  includeExamplesCheckbox = document.getElementById('includeExamples');
  outputFormatSelect = document.getElementById('outputFormat');
  docTitleInput = document.getElementById('docTitle');
  docSubtitleInput = document.getElementById('docSubtitle');
  generateDocButton = document.getElementById('generateDocButton');
  cancelDocButton = document.getElementById('cancelDocButton');
}

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM chargé, initialisation...');
  
  try {
    // Initialiser les éléments DOM
    initializeElements();
    
    // Ajouter les méthodes manquantes
    if (docGenerator) {
      // Méthode pour sélectionner/désélectionner une API
      docGenerator.toggleApiSelection = function(apiId) {
        console.log(`Toggle sélection API ${apiId}`);
        if (this.selectedApis.has(apiId)) {
          this.selectedApis.delete(apiId);
        } else {
          this.selectedApis.add(apiId);
        }
        console.log(`APIs sélectionnées: ${this.selectedApis.size}`);
      };

      // Méthode pour sélectionner toutes les APIs
      docGenerator.selectAllApis = function() {
        this.apis.forEach(api => {
          if (api && api.id) {
            this.selectedApis.add(api.id);
          }
        });
        console.log(`Toutes les APIs sélectionnées: ${this.selectedApis.size}`);
      };

      // Méthode pour désélectionner toutes les APIs
      docGenerator.deselectAllApis = function() {
        this.selectedApis.clear();
        console.log('Toutes les APIs désélectionnées');
      };
    } else {
      console.error('docGenerator non disponible');
      showError('Erreur lors de l\'initialisation du générateur de documentation');
      return;
    }
    
    // Vérifier que les éléments essentiels sont présents
    if (!statusElement || !apiListElement) {
      console.error('Éléments DOM essentiels manquants');
      return;
    }

    if (!toggleButton) {
      console.error('Bouton de surveillance manquant');
    } else {
      // Ajouter l'écouteur d'événement pour le bouton de surveillance
      toggleButton.addEventListener('click', () => {
        console.log('Bouton de capture cliqué');
        toggleButton.disabled = true;
        
        chrome.runtime.sendMessage({ action: 'toggleMonitoring' }, (response) => {
          console.log('Réponse reçue:', response);
          if (response && typeof response === 'object') {
            updateStatus(response.isMonitoring);
          } else {
            console.error('Réponse invalide:', response);
            toggleButton.disabled = false;
          }
        });
      });
    }

    if (!generateButton) {
      console.error('Bouton de génération manquant');
    } else {
      // Ajouter l'écouteur d'événement pour le bouton de génération
      generateButton.addEventListener('click', async () => {
        try {
          showLoading(generateButton, 'Génération en cours...');
          showStatus('Génération de la documentation...', 'info');
          hideDownloadSection();

          console.log('Génération de la documentation...');
          console.log(`Nombre d'APIs: ${docGenerator.apis.length}`);
          console.log(`APIs sélectionnées: ${docGenerator.selectedApis.size}`);
          
          if (docGenerator.selectedApis.size === 0) {
            throw new Error('Aucune API sélectionnée pour la documentation');
          }
          
          // Générer la documentation
          generatedDocumentation = await docGenerator.generateAndDownload();
          
          showStatus('Documentation générée avec succès !', 'success');
          showDownloadSection();
        } catch (error) {
          console.error('Erreur lors de la génération de la documentation:', error);
          showStatus(`Erreur: ${error.message}`, 'error');
        } finally {
          hideLoading(generateButton, 'Générer la documentation');
        }
      });
    }

    if (!selectAllButton) {
      console.error('Bouton sélectionner tout manquant');
    } else {
      // Ajouter l'écouteur d'événement pour le bouton sélectionner tout
      selectAllButton.addEventListener('click', () => {
        if (docGenerator && typeof docGenerator.selectAllApis === 'function') {
          docGenerator.selectAllApis();
          chrome.storage.local.get(['capturedApis'], (result) => {
            updateApiList(result.capturedApis || {});
          });
        }
      });
    }

    if (!deselectAllButton) {
      console.error('Bouton désélectionner tout manquant');
    } else {
      // Ajouter l'écouteur d'événement pour le bouton désélectionner tout
      deselectAllButton.addEventListener('click', () => {
        if (docGenerator && typeof docGenerator.deselectAllApis === 'function') {
          docGenerator.deselectAllApis();
          chrome.storage.local.get(['capturedApis'], (result) => {
            updateApiList(result.capturedApis || {});
          });
        }
      });
    }

    if (!clearButton) {
      console.error('Bouton effacer manquant');
    } else {
      // Ajouter l'écouteur d'événement pour le bouton effacer
      clearButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'clearApis' }, () => {
          if (docGenerator) {
            docGenerator.apis = [];
            docGenerator.selectedApis.clear();
            updateApiList({});
          }
        });
      });
    }

    // Ajouter l'écouteur d'événement pour le bouton de téléchargement
    if (downloadButton) {
      downloadButton.addEventListener('click', () => {
        if (generatedDocumentation) {
          try {
            const blob = new Blob([generatedDocumentation.content], { type: generatedDocumentation.mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = generatedDocumentation.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showStatus('Documentation téléchargée avec succès !', 'success');
          } catch (error) {
            console.error('Erreur lors du téléchargement:', error);
            showStatus(`Erreur lors du téléchargement: ${error.message}`, 'error');
          }
        } else {
          showStatus('Aucune documentation générée', 'error');
        }
      });
    }

    // Charger l'état initial
    await docGenerator.loadApisFromStorage();
    chrome.storage.local.get(['isMonitoring', 'capturedApis'], (result) => {
      console.log('État initial chargé:', result);
      if (typeof updateStatus === 'function') {
        updateStatus(result.isMonitoring || false);
      }
      if (typeof updateApiList === 'function') {
        updateApiList(result.capturedApis || {});
      }
    });

    // Écouter les mises à jour des APIs
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.capturedApis && typeof updateApiList === 'function') {
        const apis = changes.capturedApis.newValue || {};
        updateApiList(apis);
      }
      if (changes.isMonitoring && typeof updateStatus === 'function') {
        updateStatus(changes.isMonitoring.newValue);
      }
    });
  } catch (e) {
    console.error('Erreur lors de l\'initialisation:', e);
    if (typeof showError === 'function') {
      showError('Erreur lors de l\'initialisation: ' + e.message);
    }
  }
});

// Gestionnaires pour la documentation enrichie
/*
if (docButton) {
  docButton.addEventListener('click', () => {
    // Masquer la liste d'API si elle est affichée
    apiListElement.classList.add('hidden');
    // Afficher les options de documentation
    docOptionsElement.classList.remove('hidden');
  });
}

if (cancelDocButton) {
  cancelDocButton.addEventListener('click', () => {
    // Masquer les options de documentation
    docOptionsElement.classList.add('hidden');
  });
}
*/

// Mise à jour de l'interface utilisateur
function updateUI() {
  // Mettre à jour le texte et la classe du bouton toggle
  toggleButton.textContent = isMonitoring ? 'Arrêter la surveillance' : 'Démarrer la surveillance';
  toggleButton.className = isMonitoring ? 'btn active' : 'btn';
  
  // Mettre à jour le statut
  statusElement.textContent = `Statut: ${isMonitoring ? 'Actif' : 'Inactif'}`;
  
  // Mettre à jour le compte d'APIs
  const apiCount = Object.keys(capturedApis).length;
  apiCountElement.textContent = `APIs capturées: ${apiCount}`;
}

// Afficher la liste des APIs capturées
function showApiList() {
  // Vider la liste actuelle
  apiItemsElement.innerHTML = '';
  
  // Obtenir les clés des APIs capturées
  const apiKeys = Object.keys(capturedApis);
  
  if (apiKeys.length === 0) {
    apiItemsElement.innerHTML = '<div class="no-apis">Aucune API capturée.</div>';
    apiListElement.classList.remove('hidden');
    return;
  }
  
  // Trier les APIs par timestamp (les plus récentes en premier)
  const sortedKeys = apiKeys.sort((a, b) => {
    const dateA = new Date(capturedApis[a].timestamp);
    const dateB = new Date(capturedApis[b].timestamp);
    return dateB - dateA;
  });
  
  // Créer un élément pour chaque API
  sortedKeys.forEach(key => {
    const api = capturedApis[key];
    const apiItem = document.createElement('div');
    apiItem.className = 'api-item';
    apiItem.dataset.id = key;
    
    // Créer le badge de méthode HTTP
    const methodClass = `method-${api.method.toLowerCase()}`;
    
    apiItem.innerHTML = `
      <div>
        <span class="api-method ${methodClass}">${api.method}</span>
        <span class="api-url">${formatUrl(api.url)}</span>
      </div>
      <div class="api-details">
        <span class="api-timestamp">${formatDate(api.timestamp)}</span>
        ${api.statusCode ? `<span class="api-status">Code: ${api.statusCode}</span>` : ''}
        ${api.type ? `<span class="api-type">Type: ${api.type}</span>` : ''}
      </div>
    `;
    
    // Ajouter un gestionnaire d'événements pour afficher les détails
    apiItem.addEventListener('click', () => {
      openDetailView(key);
    });
    
    apiItemsElement.appendChild(apiItem);
  });
  
  // Afficher la liste
  apiListElement.classList.remove('hidden');
  
  // Masquer les options de documentation si elles sont affichées
  docOptionsElement.classList.add('hidden');
}

// Ouvrir la vue détaillée d'une API
function openDetailView(apiId) {
  const api = capturedApis[apiId];
  if (!api) return;
  
  try {
    // Créer une nouvelle fenêtre pour afficher les détails
    chrome.windows.create({
      url: chrome.runtime.getURL('detail.html'),
      type: 'popup',
      width: 800,
      height: 600
    }, (window) => {
      if (chrome.runtime.lastError) {
        console.error("Erreur lors de l'ouverture de la fenêtre:", chrome.runtime.lastError);
        showError("Impossible d'ouvrir la fenêtre de détails");
        return;
      }
      
      // Stocker l'ID de l'API à afficher
      chrome.storage.local.set({ currentApiId: apiId });
    });
  } catch (error) {
    console.error("Erreur lors de l'ouverture de la vue détaillée:", error);
    showError("Erreur lors de l'ouverture des détails");
  }
}

// Exporter la documentation
function exportDocumentation(callback) {
  // Générer un document Markdown à partir des APIs capturées
  let markdown = "# Documentation des APIs\n\n";
  
  const apiKeys = Object.keys(capturedApis);
  if (apiKeys.length === 0) {
    alert('Aucune API à exporter.');
    if (callback) callback();
    return;
  }
  
  // Trier les APIs par URL et méthode pour regrouper les endpoints similaires
  const sortedKeys = apiKeys.sort((a, b) => {
    const urlA = formatUrl(capturedApis[a].url);
    const urlB = formatUrl(capturedApis[b].url);
    
    if (urlA === urlB) {
      return capturedApis[a].method.localeCompare(capturedApis[b].method);
    }
    
    return urlA.localeCompare(urlB);
  });
  
  // Créer une table des matières
  markdown += "## Table des matières\n\n";
  
  sortedKeys.forEach((key, index) => {
    const api = capturedApis[key];
    markdown += `${index + 1}. [${api.method} ${formatUrl(api.url)}](#api-${key})\n`;
  });
  
  markdown += "\n---\n\n";
  
  // Ajouter les détails de chaque API
  sortedKeys.forEach(key => {
    const api = capturedApis[key];
    
    markdown += `<a id="api-${key}"></a>\n`;
    markdown += `## ${api.method} ${formatUrl(api.url)}\n\n`;
    markdown += `**URL complète:** \`${api.url}\`\n\n`;
    markdown += `**Type d'API:** ${api.type || 'REST'}\n\n`;
    markdown += `**Timestamp:** ${formatDate(api.timestamp)}\n\n`;
    
    // En-têtes de requête
    markdown += "### En-têtes de requête\n\n";
    markdown += "```\n";
    markdown += formatObjectAsText(api.requestHeaders);
    markdown += "\n```\n\n";
    
    // Corps de la requête
    markdown += "### Corps de la requête\n\n";
    if (api.requestBody) {
      markdown += "```json\n";
      if (api.requestBody.type === 'formData') {
        markdown += formatObjectAsText(api.requestBody.content);
      } else if (api.requestBody.type === 'raw') {
        markdown += formatJsonOrText(api.requestBody.content);
      } else {
        markdown += "Aucun corps ou format non pris en charge";
      }
      markdown += "\n```\n\n";
    } else {
      markdown += "Aucun corps de requête\n\n";
    }
    
    // Code de statut
    markdown += `### Code de statut\n\n${api.statusCode || 'N/A'}\n\n`;
    
    // En-têtes de réponse
    markdown += "### En-têtes de réponse\n\n";
    markdown += "```\n";
    markdown += formatObjectAsText(api.responseHeaders);
    markdown += "\n```\n\n";
    
    // Corps de la réponse (si disponible)
    markdown += "### Corps de la réponse\n\n";
    if (api.responseBody) {
      markdown += "```json\n";
      markdown += formatJsonOrText(api.responseBody);
      markdown += "\n```\n\n";
    } else {
      markdown += "Corps de réponse non disponible\n\n";
    }
    
    markdown += "---\n\n";
  });
  
  // Ajouter des métadonnées
  markdown += "## Métadonnées\n\n";
  markdown += `* **Date d'exportation:** ${new Date().toLocaleString()}\n`;
  markdown += `* **Nombre d'APIs documentées:** ${apiKeys.length}\n`;
  
  // Créer un blob et un lien de téléchargement
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `api-documentation-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a);
  a.click();
  
  // Nettoyer
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (callback) callback();
  }, 100);
}

// Gestionnaires pour la documentation enrichie
/*
if (docButton) {
  docButton.addEventListener('click', () => {
    // Masquer la liste d'API si elle est affichée
    apiListElement.classList.add('hidden');
    // Afficher les options de documentation
    docOptionsElement.classList.remove('hidden');
  });
}

if (cancelDocButton) {
  cancelDocButton.addEventListener('click', () => {
    // Masquer les options de documentation
    docOptionsElement.classList.add('hidden');
  });
}
*/

// Fonctions utilitaires
function formatUrl(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.pathname}${urlObj.search}`;
  } catch (e) {
    console.error("Erreur lors du formatage de l'URL:", e);
    return url;
  }
}

function formatDate(timestamp) {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString();
  } catch (e) {
    console.error("Erreur lors du formatage de la date:", e);
    return timestamp || 'N/A';
  }
}

function formatObjectAsText(obj) {
  if (!obj || Object.keys(obj).length === 0) return 'N/A';
  try {
    return Object.entries(obj)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
  } catch (e) {
    console.error("Erreur lors du formatage de l'objet:", e);
    return JSON.stringify(obj);
  }
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

function showError(message) {
  const errorElement = document.getElementById('errorMessage');
  if (!errorElement) return;
  
  errorElement.textContent = message;
  errorElement.classList.add('visible');
  
  // Faire disparaître après 3 secondes
  setTimeout(() => {
    errorElement.classList.remove('visible');
  }, 3000);
}

function showSuccess(message) {
  showStatus(message, 'success');
} 