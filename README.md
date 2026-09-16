# Dora the Explorer

A calm, browser-based Gemini chat workspace. It uses the Gemini REST API directly from the browser.

## Run

From this folder, install dependencies and start the React app:

```sh
npm install
npm run dev
```

Open the URL shown by Vite, click `Connect API`, and paste a key from [Google AI Studio](https://aistudio.google.com/app/apikey).

## Optional default key via environment variable

You can configure a default key used when no user key is set in the current session:

```sh
cp .env.example .env
```

Then set:

```sh
VITE_GEMINI_API_KEY=your_gemini_api_key
```

This key is bundled into the client app by Vite, so anyone with app access can extract it. Use this only for trusted/internal deployments.

The default model is `gemini-3.6-flash`, using the Gemini Interactions API. Change `state.model` in `app.js` if your account uses another Gemini model.
