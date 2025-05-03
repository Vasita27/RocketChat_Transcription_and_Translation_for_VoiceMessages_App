import time
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

ASSEMBLYAI_API_KEY = 'assembly_api_key'
ASSEMBLYAI_TRANSCRIBE_URL = 'https://api.assemblyai.com/v2/transcript'
ASSEMBLYAI_UPLOAD_URL = 'https://api.assemblyai.com/v2/upload'

HEADERS = {
    'authorization': ASSEMBLYAI_API_KEY,
    'content-type': 'application/json'
}

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    try:
        data = request.get_json()
        audio_url = data.get('audio_url')

        if not audio_url:
            return jsonify({'error': 'audio_url is required'}), 400

        # Step 1: Download the audio file locally
        print(f"[INFO] Downloading audio from Rocket.Chat: {audio_url}")
        audio_response = requests.get(audio_url, stream=True)

        if audio_response.status_code != 200:
            return jsonify({'error': 'Failed to download audio file', 'details': audio_response.text}), 500

        # Step 2: Upload the file to AssemblyAI
        print("[INFO] Uploading file to AssemblyAI")
        upload_response = requests.post(
            ASSEMBLYAI_UPLOAD_URL,
            headers={'authorization': ASSEMBLYAI_API_KEY},
            data=audio_response.content
        )

        if upload_response.status_code != 200:
            return jsonify({'error': 'Upload to AssemblyAI failed', 'details': upload_response.text}), 500

        uploaded_audio_url = upload_response.json()['upload_url']

        # Step 3: Start transcription with speaker labels
        transcript_request = {
            'audio_url': uploaded_audio_url,
            'speaker_labels': True
        }

        print("[INFO] Sending transcription request to AssemblyAI")
        response = requests.post(ASSEMBLYAI_TRANSCRIBE_URL, json=transcript_request, headers=HEADERS)
        if response.status_code != 200:
            return jsonify({'error': 'Failed to start transcription', 'details': response.text}), 500

        transcript_id = response.json()['id']
        print(f"[INFO] Transcript job started. ID: {transcript_id}")

        # Step 4: Poll for completion
        while True:
            poll_response = requests.get(f'{ASSEMBLYAI_TRANSCRIBE_URL}/{transcript_id}', headers=HEADERS)
            status = poll_response.json()['status']
            print(f"[INFO] Polling status: {status}")
            if status == 'completed':
                break
            elif status == 'error':
                return jsonify({'error': 'Transcription failed', 'details': poll_response.json()}), 500
            time.sleep(2)

        result = poll_response.json()
        utterances = result.get('utterances', [])

        formatted_transcript = ""
        print(utterances)
        for utt in utterances:
            try:
                speaker = f"Speaker {utt['speaker']}"
            except (ValueError, TypeError):
                speaker = "Speaker Unknown"
            text = utt.get('text', '')
            formatted_transcript += f"{speaker}: {text}\n"


        return jsonify({
            'id': transcript_id,
            'text': formatted_transcript.strip(),
            'utterances': utterances
        })

    except Exception as e:
        print(e)
        return jsonify({'error': 'Server error', 'message': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5005, debug=True)

