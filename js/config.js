// Substitua os valores com suas credenciais do Firebase:
// 1. Acesse https://console.firebase.google.com/
// 2. Crie um projeto > Adicionar app Web (ícone </> na tela inicial)
// 3. Cole o config aqui
// 4. Ative: Authentication > Google | Firestore Database
// 5. Em Firestore > Regras, use o conteúdo de `firestore.rules` (na raiz do repo).
//    NÃO use `allow read, write: if request.auth != null` — libera tudo pra
//    qualquer logado. Deploy: `firebase deploy --only firestore:rules`.

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  apiKey: "AIzaSyCkFj0r98DzSpC4eVLPpIYRRmqGJefy1E4",
  authDomain: "copados-a9c73.firebaseapp.com",
  projectId: "copados-a9c73",
  storageBucket: "copados-a9c73.firebasestorage.app",
  messagingSenderId: "123134394391",
  appId: "1:123134394391:web:16fccfc11e3b5711859c52",
  measurementId: "G-E4YRL7RZFR"
};