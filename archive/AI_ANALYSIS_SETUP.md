# ChatGPT Integration Setup Instructions

## Prerequisites
- Ensure Python 3.7 or higher is installed.
- Install necessary libraries (e.g., Flask, requests) using pip:
  ```bash
  pip install flask requests
  ```

## Steps to Integrate ChatGPT
1. **Create an OpenAI Account**: Visit [OpenAI](https://www.openai.com/) and sign up.
2. **Obtain API Key**: After logging in, navigate to the API section and generate an API key.
3. **Set Up Your Project**:
   - Create a new directory for your project:
     ```bash
     mkdir chatgpt-integration
     cd chatgpt-integration
     ```
   - Create a Python file for your application (e.g., `app.py`).
4. **Implement the Code**:
   - Use the following code as a base:
     ```python
     from flask import Flask, request, jsonify
     import requests

     app = Flask(__name__)

     @app.route('/ask', methods=['POST'])
     def ask():
         user_input = request.json.get('question')
         headers = {
             'Authorization': f'Bearer YOUR_API_KEY',
             'Content-Type': 'application/json'
         }
         data = {'messages': [{'role': 'user', 'content': user_input}]}
         response = requests.post('https://api.openai.com/v1/chat/completions', headers=headers, json=data)
         return jsonify(response.json())

     if __name__ == '__main__':
         app.run(debug=True)
     ```
   - Remember to replace `YOUR_API_KEY` with your actual API key.
5. **Run Your Application**:
   - Execute the following command to start your Flask app:
     ```bash
     python app.py
     ```
6. **Test the Integration**:
   - Use a tool like Postman to send a POST request to `http://127.0.0.1:5000/ask` with the JSON body:
     ```json
     {"question": "Your question here"}
     ```

## Final Notes
- Keep your API key secret. Do not expose it in public repositories or front-end code.
- Review OpenAI's usage policies to ensure compliance.
