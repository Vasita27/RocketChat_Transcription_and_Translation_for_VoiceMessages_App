# 🎙️ Rocket.Chat Audio Transcription & Translation App

This project is a prototype Rocket.Chat App that automatically detects `.mp3` audio attachments in messages, transcribes the speech using a Flask backend (Google Speech Recognition), and translates the output using the Gemini API. It replies back to the sender in the thread with both the original transcription and its translation.

---

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

**Clone this repo:**

```bash
git clone https://github.com/your-username/rocketchat-transcription-app.git
cd rocketchat-transcription-app/rocket-chat-app
```

**Install Rocket.Chat Apps CLI:**

```bash
npm install -g @rocket.chat/apps-cli
```

**Deploy the app:**

```bash
rc-apps deploy
```

> ⚠️ You must have admin credentials and an active Rocket.Chat instance with developer mode enabled.

---

## 🌐 Configuration

### 🔧 Update the Transcription API Endpoint

Inside `TranscriptionApp.ts`, update the IP address:

```ts
const response = await http.post('http://<YOUR_LOCAL_IP>:5005/transcribe', {
```

> 💡 Use `ipconfig` (Windows) or `ifconfig` (Linux/macOS) to find your local IP.

You can also expose your Flask server using [ngrok](https://ngrok.com/):

```bash
ngrok http 5005
```

Then replace the local IP with the ngrok URL.

---

### 🔐 Gemini Translation API

Used for translating the transcription result.

1. Sign up at [Google AI Studio](https://makersuite.google.com/)
2. Create a Gemini API key (free-tier supported).
3. Paste your API key in `TranscriptionApp.ts`:

```ts
const apiKey = "YOUR_GEMINI_API_KEY"
```

> ⚠️ For production use, **store this securely** using Rocket.Chat App settings instead of hardcoding it.

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

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2025 [Your Name]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights  
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell      
copies of the Software, and to permit persons to whom the Software is         
furnished to do so, subject to the following conditions:                       

The above copyright notice and this permission notice shall be included in    
all copies or substantial portions of the Software.                           

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR    
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,      
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE   
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER        
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, 
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN     
THE SOFTWARE.
```

> ✏️ Replace `[Your Name]` with your actual name or GitHub username.
