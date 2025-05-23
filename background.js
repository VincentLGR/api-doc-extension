// État global pour suivre si la surveillance est active
let isMonitoring = false;
let capturedApis = {};
let captureTimeout = null;
let responseTimeouts = {};

// Initialiser les permissions pour chrome.scripting
chrome.runtime.onInstalled.addListener(() => {
  chrome.permissions.contains({ permissions: ['scripting'] }, (result) => {
    if (!result) {
      console.warn('L\'extension n\'a pas la permission scripting. Certaines fonctionnalités peuvent ne pas fonctionner.');
    }
  });
});

// Écouteur pour les messages du popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message reçu:', message);
  
  if (message.action === "toggleMonitoring") {
    console.log('État actuel de la surveillance:', isMonitoring);
    
    // Inverser l'état
    isMonitoring = !isMonitoring;
    console.log('Nouvel état de la surveillance:', isMonitoring);
    
    if (isMonitoring) {
      // Démarrer la capture après 5 secondes
      console.log('Démarrage de la capture dans 5 secondes...');
      captureTimeout = setTimeout(() => {
        console.log("Démarrage de la capture des APIs");
        startCapture();
      }, 5000);
      
      // Envoyer une réponse immédiate avec le statut
      sendResponse({ 
        status: "Actif (démarrage dans 5s)",
        isMonitoring: true 
      });
    } else {
      // Arrêter la capture immédiatement
      console.log('Arrêt de la capture...');
      if (captureTimeout) {
        clearTimeout(captureTimeout);
        captureTimeout = null;
      }
      
      // Annuler tous les timeouts de réponse en attente
      Object.keys(responseTimeouts).forEach(timeoutId => {
        clearTimeout(responseTimeouts[timeoutId]);
        delete responseTimeouts[timeoutId];
      });
      
      // Envoyer une réponse immédiate avec le statut
      sendResponse({ 
        status: "Inactif",
        isMonitoring: false 
      });
    }
    
    // Sauvegarder l'état
    chrome.storage.local.set({ isMonitoring }, () => {
      console.log('État sauvegardé:', isMonitoring);
    });
  } else if (message.action === "getApis") {
    sendResponse({ apis: capturedApis });
  } else if (message.action === "clearApis") {
    capturedApis = {};
    chrome.storage.local.set({ capturedApis });
    sendResponse({ status: "success" });
  } else if (message.action === "exportApi") {
    if (message.apiId && capturedApis[message.apiId]) {
      sendResponse({ api: capturedApis[message.apiId] });
    } else {
      sendResponse({ error: "API non trouvée" });
    }
  }
  
  return true; // Important pour garder le canal de communication ouvert
});

// Écouter les messages du content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'contentScriptLoaded') {
    console.log('Content script chargé sur', sender.tab?.url || 'une page');
    sendResponse({ status: 'ok' });
  } else if (message.action === 'apiResponse' && isMonitoring) {
    console.log('Réponse API reçue du content script:', message.data.url);
    
    // Vérifier que la réponse contient bien un corps
    if (!message.data.body) {
      console.warn('Réponse API sans corps reçue pour:', message.data.url);
      sendResponse({ success: false, error: 'Corps de réponse vide' });
      return true;
    }
    
    // Chercher une requête correspondante dans notre cache
    let requestId = findMatchingRequestId(message.data.url, message.data.method);
    
    // Si aucune requête correspondante n'est trouvée, vérifier s'il existe déjà une API similaire
    if (!requestId) {
      const existingApiId = findExistingApiId(message.data.url, message.data.method);
      if (existingApiId) {
        requestId = existingApiId;
      }
    }
    
    if (requestId && capturedApis[requestId]) {
      console.log('Mise à jour de la requête existante avec la réponse');
      
      // Vérifier si nous avons déjà une réponse et si nous devons la remplacer
      if (capturedApis[requestId].responseBody) {
        console.log('Réponse déjà présente, vérification si remplacement nécessaire');
        
        // Ne remplacer que si la nouvelle réponse est plus complète/intéressante
        if (typeof message.data.body === 'object' && 
            (typeof capturedApis[requestId].responseBody !== 'object' || 
             JSON.stringify(message.data.body).length > JSON.stringify(capturedApis[requestId].responseBody).length)) {
          console.log('Nouvelle réponse plus complète, remplacement');
          capturedApis[requestId].responseBody = message.data.body;
          capturedApis[requestId].responseHeaders = message.data.headers || capturedApis[requestId].responseHeaders;
          capturedApis[requestId].statusCode = message.data.status || capturedApis[requestId].statusCode;
        }
      } else {
        // Pas de réponse existante, mettre à jour
        capturedApis[requestId].responseBody = message.data.body;
        capturedApis[requestId].responseHeaders = message.data.headers || capturedApis[requestId].responseHeaders;
        capturedApis[requestId].statusCode = message.data.status || capturedApis[requestId].statusCode;
      }
      
      // Sauvegarder les modifications
      chrome.storage.local.set({ capturedApis }, () => {
        if (chrome.runtime.lastError) {
          console.error('Erreur lors de la sauvegarde de la réponse:', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, message: 'Réponse mise à jour avec succès' });
        }
      });
    } else {
      console.log('Création d\'une nouvelle entrée pour la réponse API');
      
      // Créer un nouvel ID unique
      const newId = Date.now().toString();
      
      // Extraire le chemin pour faciliter les comparaisons futures
      let path = message.data.url;
      try {
        const urlObj = new URL(message.data.url);
        path = urlObj.pathname + urlObj.search;
      } catch (e) {
        console.error("Erreur lors de l'extraction du chemin:", e);
      }
      
      // Créer une nouvelle entrée
      capturedApis[newId] = {
        url: message.data.url,
        path: path,
        method: message.data.method,
        timestamp: message.data.timestamp,
        requestHeaders: {},
        requestBody: null,
        responseHeaders: message.data.headers || {},
        responseBody: message.data.body,
        statusCode: message.data.status,
        type: detectApiType(message.data.url, message.data.method)
      };
      
      // Sauvegarder les modifications
      chrome.storage.local.set({ capturedApis }, () => {
        if (chrome.runtime.lastError) {
          console.error('Erreur lors de la sauvegarde de la nouvelle API:', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, message: 'Nouvelle API enregistrée avec succès' });
        }
      });
    }
  }
  
  return true;
});

// Fonction pour démarrer la capture
function startCapture() {
  console.log("Capture des APIs active");
  // Les écouteurs existants continueront de fonctionner
}

// Chargement de l'état au démarrage
chrome.storage.local.get(['isMonitoring', 'capturedApis'], (result) => {
  console.log('État initial chargé:', result);
  isMonitoring = result.isMonitoring || false;
  capturedApis = result.capturedApis || {};
});

// Écouteur pour capturer les requêtes
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!isMonitoring) return;
    
    // Éviter de capturer les requêtes de l'extension elle-même
    if (details.initiator && details.initiator.startsWith("chrome-extension://")) {
      return;
    }
    
    // Filtrer les requêtes API
    if (isApiRequest(details.url)) {
      const requestId = details.requestId;
      
      // Vérifier si cette API existe déjà par URL et méthode
      const existingApiId = findExistingApiId(details.url, details.method);
      
      if (existingApiId) {
        // Si l'API existe déjà, utiliser cet ID au lieu d'en créer un nouveau
        console.log(`API déjà enregistrée (${details.method} ${details.url}), mise à jour du corps de requête`);
        capturedApis[existingApiId].requestBody = getRequestBody(details);
        // Conserver son timestamp d'origine pour maintenir l'ordre chronologique
      } else if (!capturedApis[requestId]) {
        // Nouvelle API, créer une entrée avec cette requestId
        console.log(`Nouvelle API capturée: ${details.method} ${details.url}`);
        
        // Extraire le chemin pour faciliter les comparaisons futures
        let path = details.url;
        try {
          const urlObj = new URL(details.url);
          path = urlObj.pathname + urlObj.search;
        } catch (e) {
          console.error("Erreur lors de l'extraction du chemin:", e);
        }
        
        capturedApis[requestId] = {
          url: details.url,
          path: path,
          method: details.method,
          timestamp: new Date().toISOString(),
          requestHeaders: {},
          requestBody: getRequestBody(details),
          responseHeaders: {},
          responseBody: null,
          statusCode: null,
          type: detectApiType(details.url, details.method)
        };
      } else {
        // Mise à jour d'une API existante par requestId
        capturedApis[requestId].requestBody = getRequestBody(details);
      }
      
      // Sauvegarder les données capturées
      chrome.storage.local.set({ capturedApis });
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

// Écouteur pour capturer les en-têtes de requête
chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    if (!isMonitoring) return;
    
    // Éviter de capturer les requêtes de l'extension elle-même
    if (details.initiator && details.initiator.startsWith("chrome-extension://")) {
      return;
    }
    
    if (isApiRequest(details.url) && capturedApis[details.requestId]) {
      capturedApis[details.requestId].requestHeaders = formatHeaders(details.requestHeaders);
      
      // Vérifier le content-type pour améliorer la détection du type d'API
      const contentType = getContentType(details.requestHeaders);
      if (contentType) {
        capturedApis[details.requestId].contentType = contentType;
      }
      
      chrome.storage.local.set({ capturedApis });
    }
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

// Écouteur pour capturer les en-têtes de réponse
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!isMonitoring) return;
    
    // Éviter de capturer les requêtes de l'extension elle-même
    if (details.initiator && details.initiator.startsWith("chrome-extension://")) {
      return;
    }
    
    if (isApiRequest(details.url) && capturedApis[details.requestId]) {
      capturedApis[details.requestId].responseHeaders = formatHeaders(details.responseHeaders);
      capturedApis[details.requestId].statusCode = details.statusCode;
      
      // Vérifier le content-type de la réponse
      const contentType = getContentType(details.responseHeaders);
      if (contentType) {
        capturedApis[details.requestId].responseContentType = contentType;
      }
      
      chrome.storage.local.set({ capturedApis });
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

// Fonction pour extraire le contenu d'une réponse
function extractResponseContent(details, apiId = null) {
  const requestId = apiId || details.requestId;
  
  if (!isMonitoring || !capturedApis[requestId]) return;

  try {
    console.log(`Capture de la réponse pour ${details.url}...`);
    
    // Ne pas tenter de capturer les réponses qui ne sont pas des données
    const contentType = capturedApis[requestId].responseHeaders['content-type'];
    if (!contentType || (
        !contentType.includes('json') && 
        !contentType.includes('text') && 
        !contentType.includes('xml') && 
        !contentType.includes('javascript')
      )) {
      console.log(`Type de contenu non supporté: ${contentType}`);
      capturedApis[requestId].responseBody = "Type de contenu non supporté";
      chrome.storage.local.set({ capturedApis });
      return;
    }
    
    // Vérifier si nous avons déjà une réponse dans le cache
    if (capturedApis[requestId].responseBody) {
      console.log(`Réponse déjà capturée pour ${details.url}`);
      return;
    }
    
    // Mémoriser la réponse pour cette requête
    const requestCache = {
      url: details.url,
      method: capturedApis[requestId].method,
      headers: capturedApis[requestId].requestHeaders
    };
    
    // Essayer de récupérer la réponse en faisant une nouvelle requête
    fetch(requestCache.url, {
      method: requestCache.method,
      headers: requestCache.headers,
      credentials: 'include'
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Erreur réseau: ${response.status}`);
      }
      return response.text();
    })
    .then(text => {
      try {
        // Essayer de parser en JSON
        const json = JSON.parse(text);
        capturedApis[requestId].responseBody = json;
      } catch (e) {
        // Si ce n'est pas du JSON valide, stocker comme texte
        capturedApis[requestId].responseBody = text;
      }
      
      // Sauvegarder les données mises à jour
      chrome.storage.local.set({ capturedApis });
      console.log(`Réponse capturée pour ${details.url}`);
    })
    .catch(error => {
      console.error(`Erreur lors de la capture par fetch pour ${details.url}:`, error);
      
      // Si fetch échoue, on utilise XMLHttpRequest comme fallback
      const xhr = new XMLHttpRequest();
      xhr.open(requestCache.method, requestCache.url, true);
      
      // Ajouter les en-têtes
      Object.entries(requestCache.headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });
      
      xhr.withCredentials = true;
      
      xhr.onload = function() {
        try {
          const responseText = xhr.responseText;
          try {
            // Essayer de parser en JSON
            const json = JSON.parse(responseText);
            capturedApis[requestId].responseBody = json;
          } catch (e) {
            // Si ce n'est pas du JSON valide, stocker comme texte
            capturedApis[requestId].responseBody = responseText;
          }
          
          // Sauvegarder les données mises à jour
          chrome.storage.local.set({ capturedApis });
          console.log(`Réponse capturée via XHR pour ${details.url}`);
        } catch (e) {
          console.error(`Erreur lors du parsing XHR pour ${details.url}:`, e);
          capturedApis[requestId].responseBody = "Erreur lors de la capture du corps de la réponse";
          chrome.storage.local.set({ capturedApis });
        }
      };
      
      xhr.onerror = function() {
        console.error(`Erreur XHR pour ${details.url}`);
        capturedApis[requestId].responseBody = "Erreur réseau lors de la capture";
        chrome.storage.local.set({ capturedApis });
      };
      
      xhr.send();
    });
  } catch (error) {
    console.error(`Erreur lors de la capture de la réponse pour ${details.url}:`, error);
    capturedApis[requestId].responseBody = "Erreur lors de la capture du corps de la réponse";
    chrome.storage.local.set({ capturedApis });
  }
}

// Écouteur pour capturer le corps de la réponse
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (!isMonitoring) return;
    
    // Éviter de capturer les requêtes de l'extension elle-même
    if (details.initiator && details.initiator.startsWith("chrome-extension://")) {
      return;
    }
    
    if (isApiRequest(details.url)) {
      try {
        // Vérifier si cette API existe déjà dans notre cache
        const existingApiId = findExistingApiId(details.url, details.method);
        
        if (existingApiId && capturedApis[existingApiId].responseBody) {
          // Si l'API existe déjà avec une réponse, ne pas réessayer de la capturer
          console.log(`API déjà capturée avec réponse (${details.method} ${details.url})`);
          return;
        }
        
        if (capturedApis[details.requestId] || existingApiId) {
          const apiId = existingApiId || details.requestId;
          
          // Essayer de capturer immédiatement, puis réessayer après un délai si nécessaire
          extractResponseContent(details, apiId);
          
          // Réessayer après un court délai pour les cas où la requête est encore en cours
          const timeoutId = setTimeout(() => {
            // Vérifier si nous avons déjà une réponse
            if (!capturedApis[apiId] || 
                !capturedApis[apiId].responseBody || 
                capturedApis[apiId].responseBody === "Erreur lors de la capture du corps de la réponse") {
              console.log(`Nouvelle tentative de capture pour ${details.url}`);
              extractResponseContent(details, apiId);
            }
            delete responseTimeouts[timeoutId];
          }, 500);
          
          // Stocker l'ID du timeout pour pouvoir l'annuler si nécessaire
          responseTimeouts[timeoutId] = timeoutId;
        }
      } catch (error) {
        console.error("Erreur lors de la capture du corps de la réponse:", error);
      }
    }
  },
  { urls: ["<all_urls>"] }
);

// Demander les permissions nécessaires
chrome.runtime.onInstalled.addListener(() => {
  chrome.permissions.contains({
    permissions: ['webRequest', 'webRequestBlocking'],
    origins: ['<all_urls>']
  }, (hasPermissions) => {
    if (!hasPermissions) {
      console.warn("L'extension n'a pas toutes les permissions nécessaires pour capturer les corps de réponse");
    }
  });
});

// Fonction auxiliaire pour déterminer si une URL est une API
function isApiRequest(url) {
  try {
    // À personnaliser selon les critères spécifiques
    const urlObj = new URL(url);
    
    // 1. Vérifier les patterns d'URL communs pour les APIs
    if (
      url.includes('/api/') || 
      url.includes('/v1/') || 
      url.includes('/v2/') || 
      url.includes('/v3/') || 
      url.includes('/graphql') ||
      url.includes('/rest/') ||
      url.includes('/service/') ||
      url.includes('/gateway/')
    ) {
      return true;
    }
    
    // 2. Vérifier les extensions/types de contenu
    const path = urlObj.pathname;
    if (
      path.endsWith('.json') || 
      path.endsWith('.xml') || 
      path.endsWith('.graphql')
    ) {
      return true;
    }
    
    // 3. Vérifier les domaines courants d'API
    const hostname = urlObj.hostname;
    if (
      hostname.startsWith('api.') || 
      hostname.includes('.api.') ||
      hostname.includes('-api.')
    ) {
      return true;
    }
    
    return false;
  } catch (e) {
    console.error("Erreur lors de l'analyse de l'URL:", e);
    return false;
  }
}

// Fonction pour déterminer si une API est déjà dans notre cache
function findExistingApiId(newUrl, newMethod) {
  try {
    // Extraire le chemin de l'URL pour une comparaison plus précise
    const newUrlObj = new URL(newUrl);
    const newPath = newUrlObj.pathname + newUrlObj.search;
    
    // Rechercher une API correspondante
    return Object.keys(capturedApis).find(id => {
      const api = capturedApis[id];
      
      // Vérifier si nous avons déjà extrait un chemin pour cette API
      if (api.path) {
        return api.method === newMethod && api.path === newPath;
      }
      
      // Sinon, essayer d'extraire le chemin à partir de l'URL
      try {
        const apiUrlObj = new URL(api.url);
        const apiPath = apiUrlObj.pathname + apiUrlObj.search;
        return api.method === newMethod && apiPath === newPath;
      } catch {
        // Si l'extraction échoue, comparer directement les URLs
        return api.method === newMethod && api.url === newUrl;
      }
    });
  } catch (e) {
    console.error("Erreur lors de la recherche d'API existante:", e);
    return null;
  }
}

// Fonction pour détecter le type d'API (REST, GraphQL, etc.)
function detectApiType(url, method) {
  if (url.includes('/graphql')) {
    return 'GraphQL';
  } else if (url.includes('/soap/') || url.includes('/ws/')) {
    return 'SOAP/WebService';
  } else {
    return 'REST';
  }
}

// Obtenir le content-type des headers
function getContentType(headers) {
  if (!headers || !Array.isArray(headers)) return null;
  
  const contentTypeHeader = headers.find(h => 
    h.name.toLowerCase() === 'content-type'
  );
  
  return contentTypeHeader ? contentTypeHeader.value : null;
}

// Fonction pour extraire le corps de la requête
function getRequestBody(details) {
  if (!details.requestBody) return null;
  
  try {
    if (details.requestBody.formData) {
      return { type: 'formData', content: details.requestBody.formData };
    } else if (details.requestBody.raw && details.requestBody.raw.length > 0) {
      return { type: 'raw', content: arrayBufferToString(details.requestBody.raw[0].bytes) };
    }
  } catch (e) {
    console.error("Erreur lors de l'extraction du corps de la requête:", e);
    return { type: 'error', content: 'Impossible de parser le corps de la requête' };
  }
  
  return null;
}

// Fonction pour formater les en-têtes
function formatHeaders(headers) {
  const result = {};
  if (headers && Array.isArray(headers) && headers.length) {
    headers.forEach(header => {
      result[header.name] = header.value;
    });
  }
  return result;
}

// Fonction pour convertir ArrayBuffer en chaîne
function arrayBufferToString(buffer) {
  if (!buffer) return "";
  
  // Tenter de décoder comme UTF-8
  try {
    return new TextDecoder("utf-8").decode(buffer);
  } catch (e) {
    console.error("Erreur lors du décodage UTF-8:", e);
    
    // Essayer d'autres encodages ou retourner en hexadécimal si nécessaire
    try {
      return new TextDecoder("iso-8859-1").decode(buffer);
    } catch (e2) {
      return "Contenu binaire (non affichable)";
    }
  }
}

// Trouver une requête correspondante dans notre cache
function findMatchingRequestId(url, method) {
  try {
    // Extraire le chemin de l'URL pour une comparaison plus précise
    const urlObj = new URL(url);
    const path = urlObj.pathname + urlObj.search;
    
    // D'abord, chercher par requestId avec URL+méthode exactes sans réponse
    const exactMatch = Object.keys(capturedApis).find(id => {
      const api = capturedApis[id];
      return api.url === url && api.method === method && !api.responseBody;
    });
    
    if (exactMatch) return exactMatch;
    
    // Ensuite, chercher par chemin+méthode sans réponse
    return Object.keys(capturedApis).find(id => {
      const api = capturedApis[id];
      
      // Si le chemin est déjà stocké
      if (api.path) {
        return api.path === path && api.method === method && !api.responseBody;
      }
      
      // Sinon, essayer d'extraire le chemin de l'URL
      try {
        const apiUrlObj = new URL(api.url);
        const apiPath = apiUrlObj.pathname + apiUrlObj.search;
        return apiPath === path && api.method === method && !api.responseBody;
      } catch {
        return false;
      }
    });
  } catch (e) {
    console.error("Erreur lors de la recherche de requête correspondante:", e);
    return null;
  }
} 