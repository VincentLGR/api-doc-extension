// Intercepte les requêtes fetch et les réponses
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const url = args[0] instanceof Request ? args[0].url : args[0];
  
  // Vérifier si c'est une URL d'API
  if (isApiUrl(url)) {
    try {
      const response = await originalFetch.apply(this, args);
      
      // Cloner la réponse pour pouvoir la lire
      const clonedResponse = response.clone();
      
      // Démarrer le traitement de la réponse dans un processus asynchrone
      // pour ne pas bloquer la réponse initiale
      captureResponseAsync(clonedResponse, url, args[1]?.method || 'GET');
      
      return response;
    } catch (error) {
      console.error('Erreur lors de l\'interception de fetch:', error);
      throw error;
    }
  }
  
  // S'il ne s'agit pas d'une URL d'API, passer la requête normalement
  return originalFetch.apply(this, args);
};

// Fonction asynchrone pour traiter les réponses sans bloquer
async function captureResponseAsync(response, url, method) {
  try {
    // Récupérer les headers
    const headers = Object.fromEntries(response.headers.entries());
    
    // Lire le corps de la réponse avec tentatives multiples si nécessaire
    const maxAttempts = 3;
    let responseBody = null;
    let attempt = 0;
    
    while (attempt < maxAttempts && responseBody === null) {
      attempt++;
      try {
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('json')) {
          const clonedResponse = response.clone(); // Recloner pour chaque tentative
          responseBody = await clonedResponse.json();
        } else if (contentType && (contentType.includes('text') || contentType.includes('xml') || contentType.includes('javascript'))) {
          const clonedResponse = response.clone();
          responseBody = await clonedResponse.text();
        } else {
          responseBody = 'Contenu binaire non supporté';
        }
      } catch (readError) {
        console.warn(`Tentative ${attempt}/${maxAttempts} de lecture du corps a échoué:`, readError);
        if (attempt === maxAttempts) {
          responseBody = `Erreur de lecture du corps: ${readError.message}`;
        } else {
          // Attendre un court délai avant de réessayer
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    }
    
    // Envoyer les données au background script uniquement si le corps a été récupéré
    const data = {
      url: url,
      method: method,
      headers: headers,
      status: response.status,
      body: responseBody,
      timestamp: new Date().toISOString()
    };
    
    // Vérifier que nous avons des données valides
    if (responseBody !== null) {
      chrome.runtime.sendMessage({
        action: 'apiResponse',
        data: data
      }, response => {
        if (chrome.runtime.lastError) {
          console.warn("Erreur d'envoi au background script:", chrome.runtime.lastError);
        } else if (response && response.success) {
          console.debug("Réponse API capturée avec succès:", url);
        }
      });
    }
  } catch (error) {
    console.error('Erreur lors de la capture de la réponse:', error);
  }
}

// Intercepter les requêtes XHR
const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function(method, url, ...args) {
  this._apiCapture = {
    method,
    url
  };
  return originalOpen.apply(this, [method, url, ...args]);
};

XMLHttpRequest.prototype.send = function(body) {
  if (this._apiCapture && isApiUrl(this._apiCapture.url)) {
    const originalOnLoad = this.onload;
    
    this.onload = function() {
      try {
        // Capturer la réponse
        const responseHeaders = this.getAllResponseHeaders().split('\r\n')
          .filter(header => header)
          .reduce((result, header) => {
            const [name, value] = header.split(': ');
            result[name] = value;
            return result;
          }, {});
        
        let responseBody;
        const contentType = responseHeaders['content-type'];
        
        if (contentType && contentType.includes('json')) {
          try {
            responseBody = JSON.parse(this.responseText);
          } catch (e) {
            responseBody = this.responseText;
          }
        } else if (contentType && (contentType.includes('text') || contentType.includes('xml') || contentType.includes('javascript'))) {
          responseBody = this.responseText;
        } else {
          responseBody = 'Contenu binaire non supporté';
        }
        
        // S'assurer que la réponse a un corps non vide
        if (responseBody && (typeof responseBody === 'object' || responseBody.length > 0)) {
          // Envoyer les données au background script
          chrome.runtime.sendMessage({
            action: 'apiResponse',
            data: {
              url: this._apiCapture.url,
              method: this._apiCapture.method,
              headers: responseHeaders,
              status: this.status,
              body: responseBody,
              timestamp: new Date().toISOString()
            }
          }, response => {
            if (chrome.runtime.lastError) {
              console.warn("Erreur d'envoi au background script (XHR):", chrome.runtime.lastError);
            }
          });
        } else {
          console.warn("Corps de réponse XHR vide ou invalide", this._apiCapture.url);
        }
      } catch (error) {
        console.error('Erreur lors de l\'interception XHR:', error);
      }
      
      // Appeler le gestionnaire d'origine
      if (originalOnLoad) {
        originalOnLoad.apply(this, arguments);
      }
    };
  }
  
  return originalSend.apply(this, [body]);
};

// Fonction pour déterminer si une URL est une API
function isApiUrl(url) {
  try {
    const urlObj = new URL(url);
    
    // Vérifie les patterns courants d'URL d'API
    return url.includes('/api/') || 
           url.includes('/v1/') || 
           url.includes('/v2/') || 
           url.includes('/v3/') || 
           url.includes('/graphql') ||
           url.includes('/rest/') ||
           url.includes('/service/') ||
           url.includes('/gateway/') ||
           urlObj.hostname.startsWith('api.');
  } catch (e) {
    return false;
  }
}

// Informer le background script que le content script est chargé
chrome.runtime.sendMessage({ action: 'contentScriptLoaded' });

console.log('Content script de capture d\'API chargé avec gestion améliorée des réponses'); 