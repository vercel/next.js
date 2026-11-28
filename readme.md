🤖 AI Lead Qualification & Email Automation
An intelligent lead qualification workflow built with n8n, OpenAI, Gmail, and Google Sheets.
This automation receives incoming lead data through a webhook, uses an AI Agent to analyze and classify the lead as Hot, Warm, or Cold, automatically sends an appropriate email response, and records the lead information in Google Sheets.
---
🚀 Project Overview
Manually reviewing and responding to every incoming lead can be time-consuming.
This workflow automates the lead qualification process:
📩 Receive lead information through a Webhook
🤖 Analyze the lead using an AI Agent
🧠 Classify the lead as Hot, Warm, or Cold
📧 Send an automated email based on the classification
📊 Store lead information in Google Sheets
🧠 Maintain conversation context using memory
🛡️ Handle invalid requests using conditional logic
The goal is to help businesses respond to valuable leads faster while reducing repetitive manual work.
---
🏗️ Workflow Architecture
```text
                    ┌───────────────┐
                    │    Webhook    │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  Edit Fields  │
                    └───────┬───────┘
                            │
                            ▼
                       ┌─────────┐
                       │   IF    │
                       └────┬────┘
                            │
                       Valid Lead
                            │
                            ▼
                  ┌──────────────────┐
                  │     AI Agent     │
                  │                  │
                  │   OpenAI Model   │
                  │   + Memory       │
                  │   + Structured   │
                  │     Parser       │
                  └────────┬─────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Edit Fields │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Switch   │
                    └──────┬──────┘
                           │
             ┌─────────────┼─────────────┐
             │             │             │
             ▼             ▼             ▼
          🔥 HOT        🟡 WARM        🔵 COLD
             │             │             │
             └─────────────┼─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Gmail    │
                    │   Response  │
                    └──────┬──────┘
                           │
                           ▼
                 ┌──────────────────┐
                 │  Google Sheets   │
                 │   Lead Database  │
                 └──────────────────┘
```
---
⚙️ Technologies Used
Technology	Purpose
n8n	Workflow automation
OpenAI	AI-powered lead analysis
AI Agent	Lead qualification and decision making
Structured Output Parser	Consistent AI output
Simple Memory	Conversation context
Gmail	Automated email communication
Google Sheets	Lead storage and tracking
Webhook	Receives incoming lead data
---
🔄 Workflow Steps
1. Webhook
The workflow starts when a new lead submits information through an HTTP request.
Example input:
```json
{
  "name": "Ahmed Ali",
  "email": "ahmed@example.com",
  "company": "Tech Solutions",
  "message": "We are interested in automating our customer support process."
}
```
2. Edit Fields
The incoming data is cleaned and organized into the fields required by the AI Agent.
Typical fields include:
```text
Name
Email
Company
Message
```
3. IF Node
The workflow checks whether the incoming request contains valid information.
```text
Valid request   → AI Agent
Invalid request → Respond to Webhook
```
This prevents incomplete requests from being processed by the AI Agent.
4. AI Agent
The AI Agent analyzes the lead using an OpenAI model.
The AI evaluates factors such as:
Business need
Level of interest
Project urgency
Potential business value
Readiness to move forward
The AI then determines the appropriate lead category.
---
🎯 Lead Classification
🔥 Hot Lead
A lead showing strong buying intent or an urgent business need.
Example:
```text
We need to implement this automation as soon as possible.
Can we schedule a meeting this week?
```
Action:
```text
HOT → High-priority email response
```
🟡 Warm Lead
A lead showing interest but requiring additional information or consideration.
Example:
```text
We're interested in automation and would like to learn more
about the available solutions.
```
Action:
```text
WARM → Informational follow-up email
```
🔵 Cold Lead
A lead with low buying intent or limited current interest.
Example:
```text
I'm just researching automation solutions for a possible
future project.
```
Action:
```text
COLD → General follow-up email
```
---
🧠 Structured AI Output
The AI Agent uses a structured output parser so downstream nodes can reliably process the result.
Example:
```json
{
  "lead_status": "hot",
  "reason": "The client has an urgent automation requirement and is ready to discuss implementation.",
  "recommended_action": "Schedule a meeting",
  "confidence": 0.94
}
```
---
📧 Automated Email Responses
After classification, the workflow routes the lead through the appropriate Gmail branch.
Hot: Encourage the lead to schedule a meeting or discuss implementation.
Warm: Provide useful information and encourage further discussion.
Cold: Acknowledge the inquiry and maintain the relationship for future opportunities.
---
📊 Google Sheets Lead Tracking
Processed leads are stored in Google Sheets for centralized tracking.
Example structure:
Name	Email	Company	Lead Status	Reason	Action	Created At
Ahmed Ali	ahmed@example.com	Tech Solutions	Hot	Urgent project	Schedule Meeting	2026-09-07
Sara Hassan	sara@example.com	ABC Company	Warm	Interested	Follow Up	2026-09-07
Omar Khaled	omar@example.com	Startup	Cold	Early research	Nurture	2026-09-07
---
🛡️ Error Handling
The workflow uses conditional logic to prevent invalid requests from continuing through the automation.
Possible validation checks include:
Missing email
Missing lead message
Invalid request structure
Missing required information
Invalid requests can be handled through the Respond to Webhook node.
---
💡 Business Value
This automation can help businesses:
⚡ Respond to leads faster
🤖 Automate initial lead qualification
📈 Prioritize high-value opportunities
📧 Reduce repetitive email work
📊 Maintain an organized lead database
🔄 Create a consistent sales follow-up process
⏱️ Reduce manual lead-processing time
---
🔧 Possible Improvements
The workflow can be extended with:
CRM Integration
Connect the workflow to CRM platforms such as HubSpot, Salesforce, or Pipedrive.
Notifications
Notify the sales team about high-priority leads through Slack, Microsoft Teams, WhatsApp, or Telegram.
Calendar Automation
Automatically create meetings using Google Calendar or another scheduling platform.
Advanced AI Scoring
Expand the classification system with a numerical score:
```text
0 ───────────────────── 100

Cold          Warm             Hot
0-39          40-69            70-100
```
Analytics Dashboard
Create dashboards to monitor:
Total leads
Hot leads
Conversion rate
Response time
Lead sources
Monthly performance
---
📁 Repository Structure
```text
AI-Lead-Qualification/
│
├── README.md
├── AI_Lead_Qualification_Workflow.json
│
├── screenshots/
│   └── workflow.png
│
└── documentation/
    └── setup.md
```
---
🔐 Required Credentials
Configure the following credentials inside n8n:
```text
OpenAI API
Gmail OAuth2
Google Sheets OAuth2
```
> Never commit API keys, OAuth secrets, passwords, webhook secrets, or other private credentials to GitHub.
---
🚀 How to Use
Import the workflow JSON into n8n.
Configure the OpenAI credential.
Configure the Gmail credential.
Configure the Google Sheets credential.
Select your Google Sheet.
Configure the Webhook endpoint.
Activate the workflow.
Send a test lead.
Verify the AI classification.
Verify the automated email.
Confirm that the lead was added to Google Sheets.
---
🧪 Example Test Lead
```text
Name:
Mohamed Hassan

Email:
mohamed@example.com

Company:
Digital Solutions

Message:
We are looking for an automation system that can qualify incoming
leads and automatically follow up with potential customers.
We would like to discuss the project as soon as possible.
```
Expected result:
```text
Lead Status: HOT
Recommended Action: Schedule Meeting
```
---
👨‍💻 Author
Mohamed Samir
AI Automation & n8n Workflow Developer
📧 Email: mohamedsamir12026@gmail.com
📱 Phone: 01125385576
---
⭐ Project Highlights
```text
✔ AI-powered lead qualification
✔ Automated email responses
✔ Hot / Warm / Cold classification
✔ Structured AI output
✔ Conversation memory
✔ Webhook integration
✔ Google Sheets lead tracking
✔ Conditional routing
✔ Error handling
✔ Scalable n8n architecture
```
---
📌 License
This project is created for portfolio and demonstration purposes.
