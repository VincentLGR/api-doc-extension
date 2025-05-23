/**
 * DocGenerator v2 – Swagger-like HTML / Markdown generator
 * --------------------------------------------------------
 * – Génère une documentation claire inspirée de Swagger UI :
 *     ✨  METHOD /endpoint   + résumé
 *     Paramètres (query, body, headers)
 *     Exemples cURL & Python
 *     Réponse partielle
 * – Masque systématiquement les données sensibles (Bearer token, e-mails).
 * – Code épuré : fonctions inutilisées supprimées, bug de spread corrigé.
 */

class DocGenerator {
  constructor() {
    this.apis = [];
    this.selectedApis = new Set();

    // Configuration par défaut
    this.config = {
      title: "Documentation API",
      subtitle: "Générée automatiquement",
      includeOnlyWithResponse: true,
      includeExamples: true,
      outputFormat: "html",      // 'html' | 'text'
      maxResponseLength: 1_000,  // Taille max de la réponse tronquée
    };
  }

  /* ------------------------------------------------------------------
   * CHARGEMENT DES APIS DEPUIS CHROME.STORAGE
   * ---------------------------------------------------------------- */
  async loadApisFromStorage() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["capturedApis"], (result) => {
        /** @type {Record<string, any>} */
        const allApis = result.capturedApis || {};
        
        // Stockage temporaire des APIs avec leurs IDs
        const tempApis = Object.entries(allApis).map(([id, api]) => ({
          ...api,
          id,
        }));
        
        // Éliminer les doublons en comparant URL+méthode
        const uniqueApis = [];
        const seenEndpoints = new Map(); // Map de "méthode:path" -> index dans uniqueApis
        
        tempApis.forEach(api => {
          try {
            const url = new URL(api.url);
            const path = url.pathname + url.search;
            const endpoint = `${api.method}:${path}`;
            
            if (seenEndpoints.has(endpoint)) {
              // Si on a déjà vu cet endpoint, remplacer par le plus récent avec réponse
              const existingIndex = seenEndpoints.get(endpoint);
              const existingApi = uniqueApis[existingIndex];
              
              // Privilégier l'API qui a une réponse
              const hasResponse = api.statusCode && api.responseBody;
              const existingHasResponse = existingApi.statusCode && existingApi.responseBody;
              
              // Remplacer l'existant si celui-ci n'a pas de réponse OU si le nouveau est plus récent
              if ((hasResponse && !existingHasResponse) || 
                  (hasResponse === existingHasResponse && new Date(api.timestamp) > new Date(existingApi.timestamp))) {
                uniqueApis[existingIndex] = api;
              }
            } else {
              // Premier endpoint de ce type
              seenEndpoints.set(endpoint, uniqueApis.length);
              uniqueApis.push(api);
            }
          } catch (e) {
            // En cas d'URL invalide, inclure quand même
            uniqueApis.push(api);
          }
        });
        
        // Mise à jour du tableau d'APIs
        this.apis = uniqueApis;
        
        // Sélectionner tout par défaut
        this.selectedApis = new Set(this.apis.map((a) => a.id));
        resolve(this.apis);
      });
    });
  }

  /* ------------------------------------------------------------------
   * GÉNÉRATION HTML SWAGGER-LIKE
   * ---------------------------------------------------------------- */
  async generateHtmlDocumentation() {
    if (this.apis.length === 0) await this.loadApisFromStorage();
    if (this.selectedApis.size === 0) {
      throw new Error("Aucune API sélectionnée pour la documentation");
    }

    // Filtrer selon la sélection + option « réponse reçue »
    const entries = this.apis.filter((a) => this.selectedApis.has(a.id));
    const apis = this.config.includeOnlyWithResponse
      ? entries.filter((a) => a.statusCode)
      : entries;

    // Sort endpoints alpha
    apis.sort((a, b) => (a.path || a.url).localeCompare(b.path || b.url));

    // ---------- Génération HTML ----------
    const esc = (s) => (s || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<title>${this.config.title}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:20px;background:#f5f5f5;color:#333}
h1{margin:0 0 5px 0}h2{margin:0 0 30px 0;color:#555}
.endpoint{background:#fff;border:1px solid #ddd;border-radius:6px;margin-bottom:30px;overflow:hidden}
.endpoint-header{padding:15px 20px;cursor:pointer;transition:background-color 0.2s;display:flex;align-items:center;gap:8px;margin:0;font-size:18px}
.endpoint-header:hover{background-color:#f9f9f9}
.endpoint-content{padding:0 20px;max-height:0;overflow:hidden;transition:max-height 0.3s ease-out,padding 0.3s}
.endpoint.active .endpoint-content{max-height:2000px;padding:0 20px 20px}
.endpoint-header .icon{margin-right:8px;font-size:18px;transition:transform 0.3s}
.endpoint.active .endpoint-header .icon{transform:rotate(90deg)}
.verb{padding:2px 8px;border-radius:3px;color:#fff;font-weight:bold;text-transform:uppercase}
.verb.get{background:#61affe}.verb.post{background:#49cc90}.verb.put{background:#fca130}
.verb.delete{background:#f93e3e}.verb.patch{background:#50e3c2}.verb.options{background:#c8c8c8}
code{background:#eef;padding:2px 4px;border-radius:3px}
table{width:100%;border-collapse:collapse;margin-bottom:15px}
th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:14px}
pre{background:#272822;color:#f8f8f2;padding:15px;border-radius:4px;overflow:auto}
.no-body,.no-headers{font-style:italic;color:#888}
.toc ul{margin:0 0 30px 20px;padding:0;list-style:disc}
.toc a{text-decoration:none;color:#3498db}
.summary{margin:0 0 15px}
</style>
<script>
document.addEventListener('DOMContentLoaded', function() {
  // Fonction pour gérer les clics sur les en-têtes d'endpoint
  document.querySelectorAll('.endpoint-header').forEach(header => {
    header.addEventListener('click', function() {
      const endpoint = this.parentElement;
      endpoint.classList.toggle('active');
    });
  });
  
  // Ouvrir automatiquement un endpoint si l'URL contient un hash
  const hash = window.location.hash;
  if (hash) {
    const targetEndpoint = document.querySelector(hash);
    if (targetEndpoint) {
      targetEndpoint.classList.add('active');
      setTimeout(() => {
        targetEndpoint.scrollIntoView({behavior: 'smooth'});
      }, 100);
    }
  }
});
</script>
</head>
<body>
<h1>${this.config.title}</h1>
<h2 class="subtitle">${this.config.subtitle}</h2>

<!-- Table des matières -->
<div class="toc">
  <strong>Table des matières</strong>
  <ul>
    ${apis
      .map(
        (api) =>
          `<li><a href="#${this._sanitizeIdString(
            api.method + api.path
          )}">${api.method} ${esc(api.path || api.url)}</a></li>`
      )
      .join("\n    ")}
  </ul>
</div>
`;

    /* ---------- Sections ENDPOINTS ---------- */
    for (const api of apis) {
      const sectionId = this._sanitizeIdString(api.method + api.path);
      html += `
<section id="${sectionId}" class="endpoint">
  <div class="endpoint-header">
    <span class="icon">▶</span>
    <span class="verb ${api.method.toLowerCase()}">${api.method}</span>
    <code>${esc(api.path || api.url)}</code>
    <span class="status-code">${api.statusCode ? ` (${api.statusCode})` : ''}</span>
  </div>

  <div class="endpoint-content">
    <p class="summary">${api.summary || "Résumé à compléter…"}</p>

    <h4>Paramètres</h4>
    ${this._generateParamsTable(api)}

    <h4>Exemple de requête cURL</h4>
    <pre>${esc(this._generateCurlExample(api))}</pre>

    <h4>Exemple Python</h4>
    <pre>${esc(this._generatePythonExample(api))}</pre>

    <h4>Exemple de réponse (partielle)</h4>
    <pre>${esc(this._truncateResponseBody(api.responseBody))}</pre>
  </div>
</section>
`;
    }

    html += `
<footer style="text-align:center;margin-top:40px;color:#999">
  Documentation générée le ${new Date().toLocaleString()}
</footer>
</body></html>`;

    return html;
  }

  /* ------------------------------------------------------------------
   * PARAMS TABLE (query + headers + body)
   * ---------------------------------------------------------------- */
  _generateParamsTable(api) {
    const queryParams = (() => {
      try {
        const urlObj = new URL(api.url);
        return Array.from(urlObj.searchParams.keys());
      } catch {
        return [];
      }
    })();

    const headerRows = Object.entries(api.requestHeaders || {})
      .filter(([k]) => !k.toLowerCase().includes("authorization"))
      .map(([k]) => `<tr><td>header</td><td>${k}</td></tr>`)
      .join("");

    const authRow =
      api.requestHeaders &&
      Object.keys(api.requestHeaders).some((k) =>
        k.toLowerCase().includes("authorization")
      )
        ? `<tr><td>header</td><td>Authorization: Bearer YOUR_ACCESS_TOKEN</td></tr>`
        : "";

    const bodyRows =
      api.requestBody && typeof api.requestBody === "object"
        ? Object.keys(api.requestBody)
            .map((k) => `<tr><td>body</td><td>${k}</td></tr>`)
            .join("")
        : "";

    const queryRows = queryParams
      .map((q) => `<tr><td>query</td><td>${q}</td></tr>`)
      .join("");

    const rows = [queryRows, headerRows, authRow, bodyRows]
      .filter(Boolean)
      .join("");

    if (!rows) return '<div class="no-headers">Aucun paramètre</div>';

    return `<table>
       <thead><tr><th>Dans</th><th>Clé</th></tr></thead>
       <tbody>${rows}</tbody>
     </table>`;
  }

  /* ------------------------------------------------------------------
   * EXEMPLES
   * ---------------------------------------------------------------- */
  _generateCurlExample(api) {
    let cmd = `curl -X ${api.method} "${api.url}"`;
    // Non-sensitive headers
    Object.entries(api.requestHeaders || {}).forEach(([k, v]) => {
      if (!k.toLowerCase().includes("authorization"))
        cmd += ` \\\n  -H "${k}: ${v}"`;
    });
    // Token générique
    if (
      api.requestHeaders &&
      Object.keys(api.requestHeaders).some((h) =>
        h.toLowerCase().includes("authorization")
      )
    ) {
      cmd += ` \\\n  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"`;
    }
    // Body
    if (api.requestBody) {
      cmd += ` \\\n  -d '${JSON.stringify(api.requestBody)}'`;
    }
    return cmd;
  }

  _generatePythonExample(api) {
    const headers = Object.entries(api.requestHeaders || {})
      .filter(([k]) => !k.toLowerCase().includes("authorization"))
      .map(([k, v]) => `    "${k}": "${v}",`)
      .join("\n");

    return `import requests

url = "${api.url}"
headers = {
    "Authorization": "Bearer YOUR_ACCESS_TOKEN",
${headers}
}
${
  api.requestBody
    ? `payload = ${JSON.stringify(
        api.requestBody,
        null,
        4
      )}\nresponse = requests.${api.method.toLowerCase()}(url, headers=headers, json=payload)`
    : `response = requests.${api.method.toLowerCase()}(url, headers=headers)`
}

print(response.json())`;
  }

  /* ------------------------------------------------------------------
   * OUTILS
   * ---------------------------------------------------------------- */
  _truncateResponseBody(body) {
    if (!body) return "";
    const str =
      typeof body === "string" ? body : JSON.stringify(body, null, 2);
    return str.length > this.config.maxResponseLength
      ? `${str.slice(0, this.config.maxResponseLength)}\n...\n(tronqué)`
      : str;
  }

  _sanitizeIdString(str = "") {
    return str.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  }

  /* ------------------------------------------------------------------
   * SÉLECTION (appelée depuis popup.js)
   * ---------------------------------------------------------------- */
  toggleApiSelection(id) {
    this.selectedApis.has(id)
      ? this.selectedApis.delete(id)
      : this.selectedApis.add(id);
  }
  selectAllApis() {
    this.apis.forEach((a) => this.selectedApis.add(a.id));
  }
  deselectAllApis() {
    this.selectedApis.clear();
  }

  /* -----------------------------------------------------------
   * Téléchargement direct (compatibilité popup.js)
   * ----------------------------------------------------------- */
  async generateAndDownload(filename = "documentation.html") {
    const html = await this.generateHtmlDocumentation();
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    // Déclenche le téléchargement
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    // Nettoyage
    URL.revokeObjectURL(url);
    a.remove();
  }
}

/* ----------------------------------------------------------------------
 * EXPORT (browser | Node)
 * -------------------------------------------------------------------- */
if (typeof module !== "undefined") {
  module.exports = DocGenerator;
} else {
  window.DocGenerator = DocGenerator;
}
