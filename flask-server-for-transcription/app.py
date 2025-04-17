from flask import Flask, request, jsonify
import requests
import speech_recognition as sr
from pydub import AudioSegment
import tempfile
import os

app = Flask(__name__)

@app.route('/transcribe', methods=['POST'])
def transcribe():
    data = request.get_json()
    if not data or 'audio_url' not in data:
        print("no proper data")
        return jsonify({'error': 'Missing audio_url in request'}), 400

    audio_url = data['audio_url']
    recognizer = sr.Recognizer()

    try:
        # Download the audio file
        response = requests.get(audio_url)
        if response.status_code != 200:
            return jsonify({'error': f'Failed to download audio: {response.status_code}'}), 400

        # Save as temp .mp3 file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as mp3_file:
            mp3_file.write(response.content)
            mp3_path = mp3_file.name

        # Convert .mp3 to .wav using pydub
        wav_path = mp3_path.replace(".mp3", ".wav")
        audio_segment = AudioSegment.from_mp3(mp3_path)
        audio_segment.export(wav_path, format="wav")

        # Use speech_recognition on the converted .wav file
        with sr.AudioFile(wav_path) as source:
            audio_data = recognizer.record(source)
            text = recognizer.recognize_google(audio_data)

        # Clean up temp files
        os.remove(mp3_path)
        os.remove(wav_path)

        return jsonify({'text': text})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5005, debug=True)

