// ChatGPT Integration Module for Telad-fleet System
// This module handles communication with OpenAI's ChatGPT API

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class ChatGPTIntegration {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.apiUrl = 'https://api.openai.com/v1/chat/completions';
    this.model = 'gpt-3.5-turbo';
  }

  async analyzeProjectIdeas(projectIdeas) {
    try {
      const prompt = `Please analyze the following project ideas and provide suggestions for improvement:\n\n${projectIdeas}\n\nPlease provide: 1. Key strengths 2. Areas for improvement 3. Potential challenges and solutions 4. Recommended tech stack 5. Timeline estimation`;
      const response = await this.sendMessage(prompt);
      return response;
    } catch (error) {
      console.error('Error analyzing project ideas:', error);
      throw error;
    }
  }

  async sendMessage(message) {
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages: [{role: 'user', content: message}],
          temperature: 0.7,
          max_tokens: 1500,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('Error sending message to ChatGPT:', error.message);
      throw error;
    }
  }

  async generateCodeSuggestions(requirements) {
    try {
      const prompt = `Based on these requirements for Telad-fleet system, provide code structure suggestions:\n\n${requirements}\n\nInclude: 1. Folder structure 2. Module organization 3. API endpoints 4. Database schema 5. Code examples`;
      const response = await this.sendMessage(prompt);
      return response;
    } catch (error) {
      console.error('Error generating code suggestions:', error);
      throw error;
    }
  }

  saveResponseToFile(fileName, content) {
    try {
      const filePath = path.join(__dirname, 'ai_responses', fileName);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Response saved to ${filePath}`);
    } catch (error) {
      console.error('Error saving response to file:', error);
      throw error;
    }
  }
}

module.exports = ChatGPTIntegration;