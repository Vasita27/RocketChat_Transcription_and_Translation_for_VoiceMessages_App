# 🎙️ Rocket.Chat Audio Transcription & Translation App

This project is a prototype Rocket.Chat App that automatically detects `.mp3` audio attachments in messages, transcribes the speech using a Flask backend (Google Speech Recognition), and translates the output using the Gemini API. It replies back to the sender in the thread with both the original transcription and its translation.

---
## 🎥 Demo Video

[![Watch the demo](https://img.youtube.com/vi/8YZsTKeM-iY/hqdefault.jpg)](https://www.youtube.com/watch?v=8YZsTKeM-iY)


## 📂 Project Structure

```
Rocket.Chat
│
├─ TranscriptionApp (Apps-Engine)
│  ├─ Detect .mp3 attachments
│  ├─ Send audio URL to Flask server (For simplicity purposes I used flask with speech recognition library supported by Google's Web Speech API)
│  ├─ Translate with Gemini API
│  └─ Reply to message with transcription & translation
│
└─ Flask Server
   ├─ Download audio via URL
   ├─ Convert .mp3 → .wav (via Pydub)
   ├─ Transcribe with Google Speech Recognition
   ├─ Delete the temporary files after transcription
   └─ Return plain text
```

---

## 🛠️ Setup Instructions

### 1. 🧪 Flask Backend (Local)

**Install dependencies:**

```bash
pip install flask requests pydub speechrecognition
```

**Run Flask server: (in proper path)**

```bash
python app.py
```

> ✅ Make sure your local IP is accessible from Rocket.Chat.

---

### 2. 🧱 Rocket.Chat App

**Setup Rocket.Chat locally by following this**
```
https://github.com/RocketChat/Rocket.Chat/blob/develop/README.md
```

**Clone this repo in the Rocket.Chat folder:**

```bash
git clone https://github.com/Vasita27/RocketChat_Transcription_and_Translation_for_VoiceMessages_App.git
cd rocketchat-transcription-app/rocket-chat-app
```

**Install Rocket.Chat Apps CLI:**

```bash
npm install -g @rocket.chat/apps-cli
```

## 🌐 Configuration

### 🔧 Update the Transcription API Endpoint

Inside `TranscriptionApp.ts`, update the IP address:

```ts
const response = await http.post('http://<YOUR_LOCAL_IP>:5005/transcribe', {
```

> 💡 Use `ipconfig` (Windows) or `ifconfig` (Linux/macOS) to find your local IP.

---

### 🔐 Gemini Translation API

Used for translating the transcription result.

1. Sign up at [Google AI Studio](https://aistudio.google.com/apikey)
2. Create a Gemini API key (free-tier supported).
3. Paste your API key in `TranscriptionApp.ts`:

```ts
const apiKey = "YOUR_GEMINI_API_KEY"
```

> ⚠️ For production use, **store this securely** using Rocket.Chat App settings instead of hardcoding it.

---

**Deploy the app or package and upload the zip folder that is generated:**

```bash
rc-apps deploy --url <server_url> -u <user> -p <pwd>
```

> ⚠️ You must have admin credentials and an active Rocket.Chat instance with developer mode enabled.

---

## 📸 Example Output

> A user sends an `.mp3` message:

✅ **App automatically responds in the same thread:**

```
*Transcription:* I will be reaching the office in ten minutes.
*Translation (ES):* Llegaré a la oficina en diez minutos.
```

---
## 📄 License

This project is licensed under the [MIT License](./LICENSE).

