# Dora the Explorer

A calm, browser-based Gemini chat workspace. It uses the Gemini REST API directly from the browser and stores the API key in local storage on this device.

## Run

From this folder, install dependencies and start the React app:

```sh
npm install
npm run dev
```

Open the URL shown by Vite, click `Connect API`, and paste a key from [Google AI Studio](https://aistudio.google.com/app/apikey).

The default model is `gemini-3.6-flash`, using the Gemini Interactions API. Change `state.model` in `app.js` if your account uses another Gemini model.
