# SimiRork — Registre technique du projet

> **But :** conserver l’architecture, les configurations validées, les commandes utiles, les erreurs déjà rencontrées et les solutions qui fonctionnent afin de ne jamais recommencer un diagnostic depuis zéro.
>
> **Règle :** avant de modifier une partie sensible de SimiRork, consulter ce fichier et comparer avec le dernier état fonctionnel connu.

## 1. Identité du projet

- Nom : **SimiRork**
- Projet local : `C:\Users\PC\my-rork-clone`
- Package Android de SimiRork : `com.yoski.simirork`
- Nom Capacitor : `SimiRork`
- Version `package.json` observée : `0.1.0`
- Dépôt GitHub : `https://github.com/novya01-hue/simirork`
- Branche principale : `main`
- Production Vercel : `https://simirork.vercel.app`
- Autre URL de production observée : `https://simirork-azsenl1cn-debutant2.vercel.app`
- Projet Vercel : `simirork`
- Project ID Vercel : `prj_HxkP1BP82ItcUBRzBnHXBlhV3hQl`
- Équipe Vercel observée : `debutant2`

## 2. Stack technique

### Web

- Next.js : `16.3.5`
- React : `19.2.8`
- Tailwind CSS : `4`
- `lucide-react` présent
- Monaco présent dans le projet
- Génération IA : `/api/generate`

### Android

- Capacitor Android / CLI / Core : `^8.5.2`
- Java pour Android : **21**
- Gradle observé : **8.14.3**
- Android platform : `android-36`
- Build tools : `36.0.0`

### Environnement Vercel

- Node.js Vercel : **24.x**

### Environnement local observé

- Node.js local : `26.9.0`

## 3. Arborescence importante

```text
C:\Users\PC\my-rork-clone
│
├── app
│   ├── api
│   │   ├── build-apk
│   │   │   ├── download\route.ts
│   │   │   ├── status\route.ts
│   │   │   └── route.ts
│   │   └── generate\route.ts
│   ├── page.tsx
│   ├── layout.tsx
│   └── globals.css
│
├── android
│   ├── app
│   │   ├── build.gradle
│   │   └── src\main\AndroidManifest.xml
│   ├── gradle
│   ├── gradlew
│   ├── gradlew.bat
│   └── settings.gradle
│
├── public
│   └── index.html
├── .github
│   └── workflows\build-apk.yml
├── capacitor.config.ts
├── package.json
├── package-lock.json
├── next.config.ts
└── tsconfig.json
```

## 4. Fonctionnement global

```text
Nouvelle application
        ↓
Nom + description
        ↓
Prompt utilisateur
        ↓
Génération IA
        ↓
HTML autonome
        ↓
Aperçu SimiRork
        ↓
Projet enregistré dans localStorage
        ↓
Générer APK
        ↓
GitHub Actions
        ↓
APK Android indépendant
        ↓
Télécharger avec le nom du projet
```

Exemples :

```text
MonBudget → monbudget.apk
Site de rencontre → site-de-rencontre.apk
Gestion Stock → gestion-stock.apk
```

## 5. Stockage des projets

Clé localStorage :

```text
simirork_projects
```

Structure logique actuelle du projet :

```ts
type Project = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  code: string;
  createdAt: string;
  updatedAt: string;
  apkStatus?: 'none' | 'building' | 'ready' | 'error';
  apkRunId?: string | null;
  apkError?: string;
};
```

### Point important

L’état APK est maintenant attaché à **chaque projet** et sauvegardé dans `localStorage`.

Cela permet à chaque application d’avoir son propre cycle :

```text
Application
→ Générer APK
→ build en cours
→ APK prêt
→ Télécharger son APK
```

## 6. Système APK

### Routes

Lancement :

```text
POST /api/build-apk
```

Le body contient notamment :

```json
{
  "code": "<HTML généré>",
  "appName": "<nom de l’application>"
}
```

La route :

1. encode le HTML en Base64 ;
2. déclenche un `repository_dispatch` GitHub ;
3. utilise l’événement `build_apk` ;
4. retrouve le `runId` du workflow.

Suivi :

```text
/api/build-apk/status?runId=<RUN_ID>
```

Téléchargement :

```text
/api/build-apk/download?runId=<RUN_ID>&appName=<APP_NAME>
```

La route de téléchargement extrait l’APK de l’artifact GitHub et génère un nom propre.

## 7. Nom du fichier APK

Le nom de l’application est converti en slug sécurisé.

Exemples :

```text
Mon Budget FCFA → mon-budget-fcfa.apk
Gestion de dépenses → gestion-de-depenses.apk
Lavage de voiture → lavage-de-voiture.apk
```

Le backend de téléchargement fait également ce nettoyage.

## 8. Application ID Android unique

Format actuel validé :

```text
com.yoski.app.<package_slug>.a<hash>
```

Exemple :

```text
com.yoski.app.monbudget.aXXXXXXX
```

### Pourquoi `a` avant le hash ?

Un segment Android ne doit pas commencer par un chiffre. Comme un hash SHA-256 peut commencer par un chiffre, on utilise :

```bash
HASH_SEGMENT="a${HASH_VALUE}"
```

puis :

```bash
APPLICATION_ID="com.yoski.app.${PACKAGE_SLUG}.${HASH_SEGMENT}"
```

### Ne pas revenir à :

```text
com.yoski.app.${PACKAGE_SLUG}.${HASH_VALUE}
```

car le dernier segment pourrait commencer par un chiffre.

## 9. Règle critique AndroidManifest.xml

### Erreur déjà rencontrée

Le build GitHub a échoué avec :

```text
Incorrect package="com.yoski.app.monbudget.ad5ee77cc"
found in source AndroidManifest.xml
```

et :

```text
Setting the namespace via the package attribute in the source AndroidManifest.xml is no longer supported.
```

Échec exact :

```text
:app:processDebugMainManifest FAILED
```

### Cause

Le workflow écrivait l’Application ID dans le manifeste source :

```xml
<manifest package="com.yoski.app....">
```

### Solution validée

L’`applicationId` doit être configuré dans :

```text
android/app/build.gradle
```

et **pas** via `package="..."` dans le manifeste source.

Le workflow actuel supprime tout ancien attribut `package="..."` du manifeste avant le build.

### Règle à ne jamais casser

**Ne pas réintroduire `package="..."` dans `android/app/src/main/AndroidManifest.xml`.**

## 10. Workflow GitHub Actions

Fichier :

```text
.github/workflows/build-apk.yml
```

Déclencheurs :

```yaml
workflow_dispatch:

repository_dispatch:
  types:
    - build_apk
```

Étapes importantes :

```text
1. Récupérer le projet
2. Préparer le nom et l’identité
3. Injecter le HTML
4. Installer Node.js
5. Installer Java 21
6. Préparer Android SDK
7. Installer les composants Android
8. Installer les dépendances Node
9. Synchroniser Capacitor
10. Configurer l’identité Android
11. Vérifier la configuration
12. Préparer Gradle
13. Rendre Gradle exécutable
14. Construire l’APK
15. Préparer le fichier APK final
16. Publier l’APK
```

Commande de build :

```bash
./gradlew assembleDebug --no-daemon
```

APK Android brut :

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Puis renommé dans :

```text
generated-apk/<nom-propre>.apk
```

Artifact GitHub :

```text
simirork-apk
```

## 11. Injection du HTML

Pendant un `repository_dispatch`, SimiRork envoie le HTML encodé en Base64.

Le workflow écrit :

```bash
printf '%s' "$HTML_BASE64" | base64 --decode > public/index.html
```

Ainsi le HTML généré par SimiRork devient le contenu Web injecté dans la build Android.

## 12. Capacitor

Configuration observée :

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yoski.simirork',
  appName: 'SimiRork',
  webDir: 'public'
};

export default config;
```

Commandes :

```powershell
npx.cmd cap sync android
```

```powershell
npx.cmd cap open android
```

## 13. Android Studio / Java

Projet Android :

```text
C:\Users\PC\my-rork-clone\android
```

JBR Android Studio utilisé localement :

```text
C:\Program Files\Android\Android Studio\jbr
```

Java observé :

```text
21.0.9
```

Commande utile en cas de problème Java local :

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
```

## 14. Erreur Java déjà rencontrée

Erreur :

```text
invalid source release: 21
```

Cause : Gradle utilisait Java 17 alors que le projet nécessitait Java 21.

Solution validée : utiliser le JBR d’Android Studio / Java 21.

## 15. PowerShell et npm

Erreur déjà rencontrée :

```text
npm.ps1 ... l’exécution de scripts est désactivée
```

Solution validée : utiliser les exécutables `.cmd`.

```powershell
npm.cmd run build
```

```powershell
npx.cmd vercel --prod
```

```powershell
npx.cmd cap sync android
```

```powershell
npx.cmd cap open android
```

## 16. Problème Vercel CLI

Message observé :

```text
Failed to spawn get latest worker
Error: write EPIPE
```

Une commande `vercel whoami` a néanmoins confirmé :

```text
Logged in as novya01-6042
Active team: debutant2
```

Un déploiement a finalement réussi avec :

```powershell
npx.cmd vercel deploy --prod --yes
```

Résultat :

```text
✓ Ready in 1m
```

et alias de production :

```text
https://simirork.vercel.app
```

### À retenir

Le message `write EPIPE` du worker ne signifie pas nécessairement que le déploiement final a échoué. Toujours vérifier si Vercel affiche `Ready` et l’URL de production.

## 17. Problèmes Git déjà rencontrés

### Référence `main` cassée

Erreur :

```text
fatal: cannot lock ref 'HEAD': unable to resolve reference 'refs/heads/main'
reference broken
```

Diagnostic : `.git\HEAD` pointait vers `refs/heads/main`, mais la référence locale était invalide / vide.

Solution historique utilisée :

```powershell
git update-ref -d refs/heads/main
```

et, lorsque nécessaire :

```powershell
Remove-Item .git\refs\heads\main -Force
```

### Référence `origin/main` cassée

Erreur :

```text
fatal: bad object refs/remotes/origin/main
```

Solution historique utilisée :

```powershell
Remove-Item .git\refs\remotes\origin\main -Force
```

puis :

```powershell
git fetch origin main
```

### Important

Ces suppressions concernent **les références Git locales**, pas les fichiers du projet. Ne pas faire de `git reset --hard` sans contrôler les modifications locales.

## 18. Historique Git important

Commit GitHub de référence avant les dernières modifications :

```text
13aa534
Corriger les identifiants Android des APK
```

Interface APK par application :

```text
3d03c95
Ajouter la génération APK par application
```

Correctif AndroidManifest / Gradle :

```text
05cc8bc
Corriger le manifeste Android pour Gradle
```

### Dernier état fonctionnel connu

La référence principale à conserver pour le workflow APK est :

```text
05cc8bc
```

## 19. Build GitHub qui a échoué avant le correctif

Run :

```text
36423019042
```

Commit :

```text
3d03c958f390880b02dcb564b48808822c04fc81
```

Étape en échec :

```text
Construire l’APK
```

Plus précisément :

```text
:app:processDebugMainManifest FAILED
```

Cause : `package="..."` dans le manifeste source.

## 20. Build GitHub précédemment réussi

Run :

```text
36174592284
```

Commit :

```text
bc9a1dadc754b130b473cb326094389a1f94f90d
```

Étape :

```text
Construire l’APK → success
Préparer le fichier APK final → success
Publier l’APK → success
```

## 21. Test fonctionnel confirmé après correction

Application testée :

```text
MonBudget
```

Résultat :

```text
✅ Génération APK réussie
✅ Téléchargement réussi
✅ Nom obtenu : monbudget.apk
```

C’est actuellement le **test fonctionnel de référence** du pipeline APK.

## 22. État fonctionnel de SimiRork

À la date du dernier test :

```text
✅ Génération IA
✅ Projets indépendants
✅ Aperçu
✅ Export HTML
✅ Génération APK
✅ GitHub Actions
✅ Application ID unique
✅ Nom APK propre
✅ Téléchargement APK
✅ Correction du manifeste Android
✅ Déploiement Vercel
✅ Ouverture Android Studio
```

## 23. Interface APK actuelle

Pour chaque application générée, l’objectif fonctionnel est :

```text
Mes applications

Budget
Application générée

[ Ouvrir ]
[ 📱 Générer APK ]
```

Après build :

```text
Budget
✅ APK prêt : budget.apk

[ Ouvrir ]
[ ⬇ Télécharger budget.apk ]
```

Pour une autre application :

```text
Site de rencontre
→ site-de-rencontre.apk
```

## 24. Fichiers sensibles / à traiter avec prudence

```text
app/page.tsx
app/api/build-apk/route.ts
app/api/build-apk/status/route.ts
app/api/build-apk/download/route.ts
.github/workflows/build-apk.yml
android/app/build.gradle
android/app/src/main/AndroidManifest.xml
android/app/src/main/java/com/yoski/simirork/MainActivity.java
app/api/generate/route.ts
capacitor.config.ts
```

## 25. Variables sensibles

Le projet utilise notamment :

```text
GITHUB_TOKEN
```

### Règle

Ne jamais mettre la valeur réelle du token dans :

- ce registre ;
- le code frontend ;
- le workflow en clair ;
- Git ;
- un message de chat.

## 26. Commandes Git utiles

```powershell
git status
```

```powershell
git remote -v
```

```powershell
git log --oneline --decorate --graph --all -n 12
```

```powershell
git fetch origin main
```

Pour publier un seul fichier :

```powershell
git add .\app\page.tsx
git commit -m "Description claire"
git push origin main
```

Éviter `git add .` sans vérifier d’abord `git status`.

## 27. Vérification workflow GitHub

```powershell
git show origin/main:.github/workflows/build-apk.yml |
Select-String -Pattern "HASH_SEGMENT|APPLICATION_ID"
```

Vérification des derniers runs :

```powershell
Invoke-RestMethod "https://api.github.com/repos/novya01-hue/simirork/actions/runs?event=repository_dispatch&branch=main&per_page=5" |
Select-Object -ExpandProperty workflow_runs |
Select-Object id,name,status,conclusion,created_at,html_url
```

Vérification des jobs :

```powershell
Invoke-RestMethod "https://api.github.com/repos/novya01-hue/simirork/actions/runs/<RUN_ID>/jobs" |
Select-Object -ExpandProperty jobs |
Select-Object name,status,conclusion,html_url
```

Vérification des étapes :

```powershell
Invoke-RestMethod "https://api.github.com/repos/novya01-hue/simirork/actions/jobs/<JOB_ID>" |
Select-Object -ExpandProperty steps |
Select-Object name,status,conclusion,number
```

## 28. Vérification build Web local

```powershell
npm.cmd run build
```

Le build Next.js qui a été validé a affiché notamment :

```text
✓ Finished TypeScript
✓ Collecting page data
✓ Generating static pages
✓ Finalizing page optimization
```

## 29. Vérification Capacitor / Android Studio

```powershell
npx.cmd cap sync android
```

```powershell
npx.cmd cap open android
```

## 30. Vercel

```powershell
npx.cmd vercel whoami
```

```powershell
npx.cmd vercel project inspect --non-interactive
```

```powershell
npx.cmd vercel deploy --prod --yes
```

## 31. Prochaine stratégie de dépannage

Toujours suivre cet ordre :

```text
1. Identifier le symptôme exact
2. Faire git status
3. Identifier le dernier commit fonctionnel
4. Identifier le Run ID si le problème est APK
5. Identifier l’étape GitHub qui échoue
6. Lire l’erreur exacte
7. Comparer avec le dernier build réussi
8. Modifier uniquement le fichier responsable
9. Tester localement si possible
10. Commit ciblé
11. Push
12. Retester
13. Mettre à jour ce registre
```

### Règle fondamentale

**Ne jamais repartir de zéro.**

Commencer par consulter :

```text
PROJECT_REGISTRY.md
```

puis comparer avec le dernier état fonctionnel et le dernier message d’erreur.

## 32. Évolutions prévues / non encore validées

Ces sujets sont des améliorations futures et ne doivent pas être considérés comme déjà terminés :

- APK Release signé
- génération AAB
- icône propre par application
- splash screen propre par application
- versioning applicatif
- export ZIP complet
- stockage serveur / synchronisation multi-appareils
- préparation Play Store

## 33. Référence rapide

```text
Projet local
C:\Users\PC\my-rork-clone

GitHub
https://github.com/novya01-hue/simirork

Production
https://simirork.vercel.app

Workflow APK
.github/workflows/build-apk.yml

Lancement APK
/api/build-apk

Statut APK
/api/build-apk/status

Téléchargement APK
/api/build-apk/download

Package SimiRork
com.yoski.simirork

Format Application ID des apps générées
com.yoski.app.<package_slug>.a<hash>

Java Android
21

Gradle
8.14.3

Android SDK
android-36

Build tools
36.0.0

Vercel Node
24.x

Node local observé
26.9.0

Commande npm Windows
npm.cmd

Commande npx Windows
npx.cmd

Dernier correctif workflow
05cc8bc
```

## 34. Journal des événements techniques connus

| Date | Événement | Résultat |
|---|---|---|
| 2026-09-25 | Pipeline APK | Builds réussis |
| 2026-09-25 | Application ID unique | Mis en place |
| 2026-09-25 | Hash Application ID | Mis en place |
| 2026-09-28 | Référence Git `main` cassée | Réparée |
| 2026-09-28 | Référence `origin/main` cassée | Réparée |
| 2026-09-28 | `main` réalignée sur GitHub | Réussi |
| 2026-09-28 | Gestion APK par projet | Commit `3d03c95` |
| 2026-09-28 | Déploiement Vercel | Réussi |
| 2026-09-28 | Erreur `package=` dans Manifest | Identifiée |
| 2026-09-28 | Correctif Manifest / Gradle | Commit `05cc8bc` |
| 2026-09-28 | Test MonBudget APK | Réussi |
| 2026-09-28 | Téléchargement | `monbudget.apk` |

## 35. État de référence

> **Le pipeline de génération et téléchargement d’APK individuel depuis SimiRork est fonctionnel.**
>
> Lorsqu’un nouveau problème apparaît, commencer par le dernier commit fonctionnel, le dernier Run ID et ce registre avant toute nouvelle modification.

## 36. Système de crédits — tarification par coût réel OpenRouter

### Mise en place validée le 2026-09-29

La tarification provisoire basée sur les tokens :

```text
1 crédit = 1 000 tokens
```

a été remplacée pour les nouvelles générations par une conversion basée sur le **coût réel retourné par OpenRouter**.

### Configuration

Variable d'environnement Production Vercel :

```text
SIMIRORK_CREDIT_VALUE_USD=0.005
```

Règle actuelle :

```text
1 crédit SimiRork = $0.005 de coût OpenRouter
```

Calcul :

```text
creditsExact = coût OpenRouter / 0.005
creditsUsed = arrondi supérieur de creditsExact
```

### API

Fichier :

```text
app/api/generate/route.ts
```

La requête OpenRouter utilise :

```ts
usage: {
  include: true,
}
```

Les informations suivantes sont récupérées :

```text
promptTokens
completionTokens
totalTokens
cost
```

La réponse API SimiRork renvoie également :

```text
creditValueUsd
creditsExact
creditsUsed
billingMethod
billingVersion
```

Version de facturation actuelle :

```text
cost-v1
```

Méthode :

```text
openrouter_cost
```

### Interface

Fichier :

```text
app/page.tsx
```

L'historique enregistre désormais :

```text
Coût OpenRouter
Valeur du crédit
Crédit exact
Crédits utilisés
Solde après génération
Méthode de facturation
Version de facturation
```

Le frontend ne recalcule plus les crédits à partir du nombre de tokens.

### Test local validé

Génération de référence :

```text
Tokens : 9 923
Coût : $0.036614
Valeur crédit : $0.005000
Crédit exact : 7.3228
Crédits consommés : 8
Solde : 72
```

Calcul vérifié :

```text
0.036614 / 0.005 = 7.3228
arrondi supérieur = 8 crédits
```

### Déploiement Production validé

La variable `SIMIRORK_CREDIT_VALUE_USD` a été ajoutée à l'environnement **Production** du projet Vercel `debutant2/simirork`.

Déploiement validé :

```text
https://simirork.vercel.app
```

Résultat du test Production :

```text
Tokens : 11 831
Coût : $0.043841
Tarif : $0.005000
Crédit exact : 8.7683
Crédits consommés : 9
Solde : 91
Méthode : Coût réel
```

Calcul vérifié :

```text
0.043841 / 0.005 = 8.7682...
arrondi supérieur = 9 crédits
100 - 9 = 91 crédits
```

### Important

Le solde et l'historique restent actuellement stockés dans `localStorage` :

```text
simirork_credits
simirork_usage_history
```

Ce stockage est adapté au prototype/test mais **ne constitue pas encore un système de crédits sécurisé pour un service commercial**.

### Prochaine évolution prévue

Passer les crédits et l'historique vers un stockage serveur associé à un utilisateur/authentification afin d'éviter qu'un utilisateur puisse modifier son solde directement depuis son navigateur.

## 37. Validation finale — 2026-09-29

### Build local

Commande :

```powershell
npm.cmd run build
```

Résultat :

```text
✓ Compiled successfully
✓ Finished TypeScript
✓ Collecting page data
✓ Generating static pages
✓ Finalizing page optimization
```

Le build de production Next.js est validé.

### Environnement Vercel Production

Variable ajoutée :

```text
SIMIRORK_CREDIT_VALUE_USD=0.005
```

Déploiement :

```text
https://simirork.vercel.app
```

Déploiement inspecté :

```text
https://vercel.com/debutant2/simirork/31PCrspARsf3yoqQyt3QxQvcLKy4
```

URL de déploiement générée :

```text
https://simirork-9sk971q8s-debutant2.vercel.app
```

Résultat :

```text
✓ Ready in 44s
✓ Aliased vers https://simirork.vercel.app
```

### Test fonctionnel Production

Résultat observé directement dans SimiRork :

```text
Dernière génération : 9 crédits
Tokens : 11 831
Coût : $0.043841
Tarif : $0.005000
Crédit exact : 8.7683
Solde : 91
Méthode : Coût réel
Prompt : 13 mots / 78 caractères
```

Calcul :

```text
0.043841 / 0.005 = 8.7682
arrondi supérieur = 9 crédits
100 - 9 = 91 crédits
```

### Conclusion

```text
✅ Coût réel OpenRouter récupéré
✅ Conversion coût → crédits fonctionnelle
✅ Solde débité correctement
✅ Historique enrichi
✅ Variable de tarification disponible en Production
✅ Fonctionnement validé localement
✅ Fonctionnement validé sur Vercel
```

## 38. Phase suivante — sécurisation réelle des crédits

État actuel :

```text
Prototype fonctionnel
```

Stockage actuel :

```text
localStorage
simirork_credits
simirork_usage_history
```

Limite :

```text
Le solde peut être modifié côté navigateur.
```

Objectif de la prochaine phase :

```text
Utilisateur authentifié
        ↓
Base de données serveur
        ↓
Solde officiel
        ↓
Validation serveur avant génération
        ↓
Appel OpenRouter
        ↓
Réception du coût réel
        ↓
Débit serveur atomique
        ↓
Historique serveur
```

Règle :

**Le navigateur ne devra plus être la source de vérité du solde.**

