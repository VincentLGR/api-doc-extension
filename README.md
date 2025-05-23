# Extension de Documentation d'API

Une extension de navigateur qui surveille le trafic réseau et génère automatiquement une documentation des APIs.

## Fonctionnalités

- **Surveillance du Trafic Réseau**: Capture les requêtes et réponses d'API lorsque l'extension est activée.
- **Détection Intelligente des APIs**: Identifie automatiquement les requêtes API parmi le trafic réseau.
- **Capture Complète des Données**: Enregistre les URLs, méthodes, en-têtes, corps de requête, et réponses.
- **Documentation Exportable**: Génère une documentation en format Markdown que vous pouvez télécharger.
- **Interface Conviviale**: Interface utilisateur simple pour contrôler la surveillance et visualiser les APIs capturées.
- **Classification des APIs**: Détection automatique du type d'API (REST, GraphQL, SOAP).

## Installation

### Chrome / Edge

1. Clonez ce dépôt ou téléchargez-le en tant qu'archive ZIP et extrayez-la.
2. Ouvrez Chrome/Edge et accédez à `chrome://extensions` ou `edge://extensions`.
3. Activez le "Mode développeur" en haut à droite.
4. Cliquez sur "Charger l'extension non empaquetée" et sélectionnez le dossier de l'extension.
5. **Important**: Avant d'utiliser l'extension, assurez-vous de créer des icônes dans le dossier `icons`:
   - `icon16.png` (16x16 pixels)
   - `icon48.png` (48x48 pixels)
   - `icon128.png` (128x128 pixels)

### Firefox

1. Clonez ce dépôt ou téléchargez-le en tant qu'archive ZIP et extrayez-la.
2. Ouvrez Firefox et accédez à `about:debugging#/runtime/this-firefox`.
3. Cliquez sur "Charger un module temporaire" et sélectionnez le fichier `manifest.json` dans le dossier de l'extension.
4. **Note**: Pour Firefox, vous devrez adapter le manifest pour utiliser le format approprié (Manifest V2).

## Utilisation

1. Cliquez sur l'icône de l'extension dans la barre d'outils du navigateur pour ouvrir le popup.
2. Cliquez sur "Démarrer la surveillance" pour commencer à capturer les requêtes API.
3. Naviguez sur le site web que vous souhaitez documenter.
4. Cliquez sur "Afficher les APIs" pour voir les APIs capturées.
5. Cliquez sur une API spécifique pour voir ses détails complets.
6. Utilisez le bouton "Exporter la documentation" pour télécharger la documentation au format Markdown.

## Structure du Projet

- `manifest.json` - Configuration de l'extension
- `background.js` - Script d'arrière-plan pour la capture des requêtes
- `popup.html` / `popup.js` / `popup.css` - Interface utilisateur du popup
- `detail.html` / `detail.js` / `detail.css` - Page de détails des APIs
- `icons/` - Dossier contenant les icônes de l'extension

## Personnalisation

### Filtrage des APIs

Par défaut, l'extension utilise plusieurs heuristiques pour identifier les requêtes API. Vous pouvez personnaliser cette détection en modifiant la fonction `isApiRequest()` dans `background.js`.

```javascript
function isApiRequest(url) {
  try {
    const urlObj = new URL(url);
    
    // 1. Vérifier les patterns d'URL communs pour les APIs
    if (
      url.includes('/api/') || 
      url.includes('/v1/') || 
      // Ajoutez vos propres patterns ici
    ) {
      return true;
    }
    
    // 2. Vérifier les extensions/types de contenu
    const path = urlObj.pathname;
    if (path.endsWith('.json') || path.endsWith('.xml')) {
      return true;
    }
    
    // 3. Vérifier les domaines courants d'API
    const hostname = urlObj.hostname;
    if (hostname.startsWith('api.')) {
      return true;
    }
    
    return false;
  } catch (e) {
    return false;
  }
}
```

### Icônes personnalisées

Pour remplacer les icônes par défaut, créez ou remplacez les fichiers suivants dans le dossier `icons/`:
- `icon16.png` - 16x16 pixels (favicon et petite icône)
- `icon48.png` - 48x48 pixels (icône moyenne)
- `icon128.png` - 128x128 pixels (icône large pour les stores d'extensions)

Suggestions d'icônes:
- Une loupe sur un document (pour symboliser l'inspection des APIs)
- Un document avec des accolades `{}` (pour symboliser les données JSON)
- Une icône de cahier avec crayon (pour symboliser la documentation)

## Limitations

- L'extension ne peut pas capturer le corps de réponse par défaut en raison des limitations des API du navigateur.
- Certains sites web avec une sécurité renforcée peuvent bloquer l'accès aux requêtes réseau.
- La détection automatique des APIs peut nécessiter des ajustements en fonction du site web cible.
- Un maximum de 50 requêtes API est conservé pour éviter les problèmes de performance.

## Gestion des erreurs

L'extension inclut une gestion robuste des erreurs:
- Affichage des messages d'erreur à l'utilisateur
- Journalisation des erreurs dans la console pour le débogage
- Protection contre les actions multiples (double-clics)
- Limitation de la taille des données stockées

## Confidentialité

Cette extension fonctionne entièrement localement dans votre navigateur. Aucune donnée n'est envoyée à des serveurs externes. Toutes les données capturées sont stockées dans le stockage local du navigateur et sont effacées lorsque vous utilisez la fonction "Effacer les données". 