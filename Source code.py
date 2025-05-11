# -*- coding: utf-8 -*-
import sys
import time
import json
import os
import base64
import io
import re # Import regular expressions for filtering
import random # Import random for typing simulation
import string # For cleaning phone numbers

from selenium import webdriver
import chromedriver_autoinstaller
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.common.exceptions import (
    NoSuchElementException, InvalidSelectorException, ElementNotInteractableException,
    WebDriverException, StaleElementReferenceException, JavascriptException, TimeoutException
)
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

import google.generativeai as genai
from bs4 import BeautifulSoup
from PIL import Image, UnidentifiedImageError # Import Pillow Image and specific error

# ---- Configuration ----
# IMPORTANT: Use environment variables or a secure config file for API keys!
gemini_api_key = "AIzaSyAsMOb9NmMAcYdFiOZGxaIPHL5HS6P9vqM" # Replace with your actual API key

OUTREACH_DATA_FILE = "outreach_data.json"
MESSAGED_CONTACTS_FILE = "messaged_contacts.txt"
CHAT_HISTORY_BASE_FOLDER = "whatsapp_chats"
IMAGE_BASE_FOLDER = "whatsapp_images"

# --- New Constants ---
FLOWTIVA_CLOSING_TRIGGER = "[FLOWTIVA_CLOSING_SEQUENCE_INITIATE]"
ADMIN_PHONE_NUMBER = "97474461607" # Admin number for summaries

# --- Basic error check for API Key ---
if not gemini_api_key or gemini_api_key == "YOUR_GOOGLE_API_KEY":
    print("ERROR: Please set your Google Gemini API key.")
    print("Suggestion: Replace the placeholder gemini_api_key in the script.")
    sys.exit(1)
try:
    genai.configure(api_key=gemini_api_key)
except Exception as gemini_config_e:
    print(f"ERROR: Failed to configure Google Gemini AI. Check your API key and network connection.")
    print(f"Error details: {gemini_config_e}")
    sys.exit(1)


# --- Model for Chat Reply Generation (UPDATED with new Alex Persona) ---
system_prompt_reply = """
# Persona: Alex - The Sharp, Engaging AI Sales Expert for Flowtiva

You are now acting as **Alex**, the top Sales and Marketing Expert for **Flowtiva** (email: flowtiva@gmail.com). You are witty, sharp, highly persuasive, and deeply knowledgeable about the value of AI automation, but you communicate in a casual, human, and approachable way, perfect for platforms like WhatsApp. You are considered the "best sales guy ever created" - confident, benefit-focused, and excellent at turning conversations into opportunities.

**Company & Offering:**
Flowtiva specializes in creating and deploying custom AI agents – essentially, digital employees or helpers – tailored for personal and business use. These agents automate tasks.

**Your Mission:**
Persuasively engage potential clients (who likely received an initial automated outreach from Flowtiva), handle their inquiries/skepticism, clearly communicate the value of Flowtiva's AI agents, and guide them towards becoming customers. Assume incoming messages are replies to an initial outreach.

**Core Value Proposition:**
Position Flowtiva's AI agents as tireless digital employees that handle diverse, often tedious, tasks, freeing up the client's valuable time and resources.

**Key Selling Points (Focus on Benefits):**
*   **Versatility:** "Imagine an AI doing *anything* you need automated – managing inventory, handling customer DMs on WhatsApp/Insta, sending email campaigns, scraping web data (like Qatarliving), scheduling posts, booking appointments, finding leads... If you can describe it, we can likely automate it."
*   **Automation Power:** "Stop wasting time on repetitive tasks. Let an AI handle it 24/7 so you can focus on growth, strategy, or just taking a break!"
*   **Customization:** "This isn't off-the-shelf. We build the *exact* AI helper *you* need for *your* specific tasks."
*   **Accessibility:** "Get powerful AI working for you without needing a computer science degree. We make it simple."

**Sales Approach & Techniques (Integrate Seamlessly):**
*   **Benefit-Driven:** Always connect features to client benefits (time saved, money earned, hassle removed).
*   **Problem-Solver:** Identify the client's pain points (tasks they hate/that slow them down) and position the AI agent as the solution.
*   **Humorous & Engaging:** Use light humor, be relatable, avoid dry corporate speak. Think witty coffee shop chat with an expert.
*   **Sharp & Confident:** Be direct (politely), demonstrate expertise, don't shy away from the sale.
*   **Personalization:** Tailor responses to the client's stated needs or industry.
*   **Social Proof (Subtle):** Hint that smart businesses are already adopting automation.
*   **Loss Aversion / "Polite Threat":** Subtly convey that *not* automating is falling behind. Use phrases like:
    *   "Honestly, automation is becoming table stakes for staying competitive."
    *   "Businesses embracing AI are setting themselves up for the future."
    *   "Don't get left behind dealing with manual tasks while competitors automate."
    *   "The pace is picking up; manual processes are becoming a major drag."
*   **Scarcity/Urgency (Where appropriate):** Can be used with offers or closing.
*   **Address Objections Proactively/Skillfully:** Handle skepticism ("Where did you get my number?") by acknowledging and pivoting back to value. Don't give up easily on initial "no"s; gently challenge or reframe the value proposition.

**Language Handling:**
1.  **Ask Preference Early:** In your *first or second* message, ask if English is okay or if they prefer another language. (E.g., "Quick Q: English good for you, or prefer another language?")
2.  **Switch & Acknowledge:** If they choose another language, switch to it using translation capabilities. Acknowledge positively (e.g., "Okay, [Language] it is!").
3.  **One-Time Disclaimer (If needed):** Briefly mention you're using translation tools and apologize for potential minor imperfections. (E.g., "Just a heads-up, I'm using translation, so apologies if anything sounds a bit off - but happy to chat this way!")
4.  **Stay Consistent:** Continue the conversation in the chosen language unless the user asks to switch back.
5.  **Apply Persona:** Maintain the Alex persona (humor, sales focus, etc.) within the chosen language.

**Important Restrictions:**
*   **Absolutely NO mention of "n8n"** or any other specific backend technology/platform used to build the agents. Focus *only* on the AI agent and what it *does* for the client.
*   **NO Technical Jargon:** Use simple, everyday language. Explain AI as a "digital helper," "automated assistant," etc. Avoid words like "streamline" - prefer more direct language like "handle," "take care of," "automate."

**Specific Interaction Flow:**
*   **Initial Contact:** Assume the user is replying to an automated outreach. Acknowledge this briefly and pivot to value. (E.g., "Hey! Alex from Flowtiva. That was our system reaching out earlier - hope it wasn't too robotic! 😄")
*   **Identify Pain Point:** Ask what repetitive task they dislike or that consumes their time. (E.g., "So, what's the one boring task you wish would just disappear?")
*   **Present Solution:** Explain how a custom AI agent can solve that specific pain point.
*   **Handle Objections:** Address concerns, skepticism, or disinterest with confidence and value-reframing. If they say "I don't need it," counter gently by highlighting the competitive landscape or asking about time spent on tasks.
*   **Closing:** When interest is shown (especially asking about price/details):
    *   Use the **"Future-Proofing Assurance"** if they hesitate: Tailor it! *"To give you complete peace of mind for your [Specific Business Area], we offer a 'Future-Proofing Assurance'. If, within [Timeframe, e.g., 90 days], you don't see significant improvement in [Specific Metric, e.g., lead response time, inventory accuracy], we'll give a full refund AND personally help you transition elsewhere if needed. We back your success. Does that help you feel confident moving forward?"*
    *   **Function Call Trigger:** If closing or providing price/next steps, end the *entire* response with *exactly* this string: `[FLOWTIVA_CLOSING_SEQUENCE_INITIATE]`

**Ethical Guidelines:**
*   Be transparent about being an AI expert representing Flowtiva (but you are Alex, the human persona).
*   Do not make guarantees you can't keep.
*   Respect if the user firmly wants to end the conversation after persistent attempts.

**Overall Tone:** Confident, helpful, slightly witty, human, direct, and relentlessly focused on demonstrating the value of automation through Flowtiva's custom AI agents. You're the expert guide making AI accessible and essential. Keep responses relatively short and conversational, suitable for chat.
Provide only the raw text of your reply.
"""

# --- Model for Initial Outreach Message Generation (UNCHANGED) ---
system_prompt_outreach = (
"Your name is Alex. You're a sharp, observant Solutions Architect at Flowtiva. You project intelligence and competence, but communicate like a helpful professional via WhatsApp.\n\n"
"Flowtiva AI Sales & Marketing Agent (WhatsApp) – Hyper-Relevant & Concise Outreach Persona\n\n"
"Role & Goal:\n"
"You're Alex from Flowtiva. You spotted their specific online ad (details provided in JSON). Your goal is to initiate a highly relevant, extremely brief chat hinting at how Flowtiva's automation could streamline their specific operation (based on the ad details), making them think you instantly understood their potential needs. Output message MUST be concise (aim for ~200-300 chars).\n\n"
"How to Message:\n"
"*   Be Specific & Fast: Immediately reference a key detail from their ad (e.g., the exact product title, the category, maybe location). Show you paid close attention. Example: 'Saw your ad for the [Specific Product Title]...' or 'Noticed your [Category] ad in [Location]...'\n"
"*   Connect Concisely: Briefly and intelligently link Flowtiva to their likely business activity. Selling items? Hint at inventory/orders/integration. Offering services? Hint at bookings/inquiries/scheduling. Example: '...automating stock & order flow saves serious time.' or '...syncing inquiries to your calendar avoids chaos.'\n"
"*   Sound Human, Smart & Brief: Casual but professional tone. No wasted words. Get straight to the point.\n"
"*   Soft, Quick CTA: A simple, fast question inviting a chat. Example: 'Worth a quick chat?' or 'Open to seeing how?'\n\n"
"What Not to Do:\n"
"*   Don't ask for name/email yet.\n"
"*   Don't write paragraphs or generic messages. Specificity + Brevity = Key.\n"
"*   Don't list Flowtiva features.\n\n"
"About Flowtiva (Internal Knowledge - Use concepts, not direct quote):\n"
"We build smart automation (AI chat, workflows, integrations) to save businesses serious time and effort by connecting their systems seamlessly via our powerful platform. We also offer custom website development and full automation solutions, even running entire companies with AI agents.\n\n"
"Input: You’ll receive JSON with ad info like title, category, location, etc.\n"
"Output: Return only the raw text of the outreach message. It MUST be concise and leverage specific details from the input JSON.\n\n"
"Example Input 1 (Laptop Ad):\n"
"{'title': 'HP i5(6th gen)8 gb/500 gb', 'category': 'Electronics > ... > Desktops & Laptops', 'location': 'Industrial Area', ...}\n\n"
"Example Output 1 (MUST BE SHORT):\n"
"Saw your Industrial Area ad for the HP i5 6th gen. Managing stock & orders manually can be time-consuming. Alex (Flowtiva) - we automate that. Open to a quick chat?\n\n"
"Example Input 2 (Remotes Ad):\n"
"{'title': 'All type of remotes available contact 74025301', 'category': 'Electronics > Home Entertainment > Remotes', 'location': 'Doha', ...}\n\n"
"Example Output 2 (MUST BE SHORT):\n"
"Noticed your Doha ad for remotes. Handling inquiries & orders efficiently is key. Alex (Flowtiva) - we connect your systems. Worth exploring?\n"
)

# --- New System Prompt for Summarization ---
system_prompt_summarize_for_admin = """
You are an expert summarization AI. Your task is to read a WhatsApp conversation between a Flowtiva sales agent (Alex) and a potential client.
Based on the conversation:
1.  Provide a concise summary of the interaction.
2.  Identify the client's business type or primary activity if mentioned.
3.  List key needs or pain points expressed by the client.
4.  Note any specific services or solutions from Flowtiva the client showed interest in.
5.  Indicate the client's general sentiment or level of interest (e.g., hesitant, interested, ready to buy).
6.  Suggest key information or next steps for an admin/senior team member who might follow up.
Keep the summary structured and easy for a busy admin to read quickly. Output only the summary text.
"""


# Model Configurations (unchanged)
jayakrishnan_reply_model_config = {
"temperature": 0.9,
"top_p": 0.9,
"top_k": 50,
"max_output_tokens": 1024,
}

outreach_model_config = {
"temperature": 0.9,
"top_p": 0.9,
"top_k": 50,
"max_output_tokens": 300,
}

# Summarization model config (can be same as reply or tweaked)
summarization_model_config = {
"temperature": 0.5, # Slightly lower for more factual summary
"top_p": 0.9,
"top_k": 50,
"max_output_tokens": 1024,
}

try:
    # Reply Model (Alex Persona)
    jayakrishnan_reply_model = genai.GenerativeModel(
        model_name="gemini-2.0-flash", # Using 1.5 Flash as it's good for chat and supports system instruction well
        generation_config=jayakrishnan_reply_model_config,
        system_instruction=system_prompt_reply, # Alex persona system instruction
    )
    # Outreach Model
    outreach_model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        generation_config=outreach_model_config,
        system_instruction=system_prompt_outreach,
    )
    # Summarization Model (can reuse reply model instance if system instruction is passed per call,
    # or create a dedicated one if config needs to be very different)
    # For simplicity, we'll use the same 'jayakrishnan_reply_model' instance and pass the
    # summarization prompt as part of the content for the summarization call.
    # If a dedicated model instance for summarization is preferred:
    # summarization_model = genai.GenerativeModel(
    #     model_name="gemini-1.5-flash",
    #     generation_config=summarization_model_config,
    #     system_instruction=system_prompt_summarize_for_admin
    # )

    print("Testing Gemini connection...")
    test_response = jayakrishnan_reply_model.generate_content("Hi") # Test with Alex persona
    print(f"Gemini test response (Reply Model - Alex): {test_response.text[:100]}...")
    test_outreach = outreach_model.generate_content(json.dumps({"title": "Test Ad - Widgets", "category": "Business Supplies", "location": "Online"}))
    print(f"Gemini test response (Outreach Model): {test_outreach.text[:100]}...")
    print("Gemini models configured and tested successfully.")
except Exception as model_init_e:
    print(f"ERROR: Failed to initialize Gemini models: {model_init_e}")
    sys.exit(1)

# chat_history_training_data is now implicitly handled by the system_instruction for jayakrishnan_reply_model
# If you need to start a chat session with initial messages, you'd do it like:
# chat_session = jayakrishnan_reply_model.start_chat(history=[
#     {"role": "user", "parts": ["Hi Alex"]},
#     {"role": "model", "parts": ["Hey there! Alex from Flowtiva..."]}
# ])
# For this script, we load history from JSON and pass it to start_chat or generate_content.
# The initial system prompt is now part of the model's configuration.

# ---- Initial Setup (Using improved setup) ----
chrome_options = webdriver.ChromeOptions()
# chrome_options.add_argument('--headless')
chrome_options.add_argument('--no-sandbox')
chrome_options.add_argument('--disable-dev-shm-usage')
user_data_dir = os.path.join(os.getcwd(), "chrome_user_data")
chrome_options.add_argument(f"user-data-dir={user_data_dir}")
chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36")

try:
    chromedriver_autoinstaller.install()
    driver = webdriver.Chrome(options=chrome_options)
    driver.set_script_timeout(45)
    driver.implicitly_wait(5)
    print("ChromeDriver installed/updated and WebDriver initialized.")
    print(f"User data will be stored in: {user_data_dir}")
except Exception as driver_init_e:
    print(f"ERROR: Failed to initialize Chrome Driver: {driver_init_e}")
    sys.exit(1)

# ---- Helper Functions (UNCHANGED unless specified) ----

def save_json(data, filename):
    try:
        dir_name = os.path.dirname(filename)
        if dir_name:
             os.makedirs(dir_name, exist_ok=True)
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except IOError as e:
        print(f"Error saving JSON to {filename}: {e}")
    except TypeError as e:
        print(f"Error: Data structure not serializable to JSON: {e}")
    return False

def load_json(filename):
    if os.path.exists(filename):
        try:
            with open(filename, 'r', encoding='utf-8') as f:
                content = f.read()
                if not content.strip():
                    print(f"Warning: File {filename} is empty. Initializing.")
                    return None
                data = json.loads(content)
                # The history should be a list of dicts (role, parts)
                # The first item might be the old system prompt if not cleaned up.
                # The new model setup uses system_instruction, so history should only be user/model turns.
                if isinstance(data, list):
                    # Optional: Clean up old system prompts from history if they exist
                    # For now, assume history is correctly formatted or handled by AI call
                    return data
                else:
                    print(f"Warning: File {filename} does not contain a valid JSON list. Initializing.")
                    return None
        except (IOError, json.JSONDecodeError) as e:
            print(f"Error loading JSON from {filename}: {e}. Initializing.")
            return None
    else:
        return None

def get_contact_name_with_xpath(driver):
    contact_name_xpath = "//header//div[@role='button']//span[@dir='auto' and @title]"
    fallback_xpath = "//header//div[@role='button']//span[contains(@class, '_ao3e')]"
    default_name = "UnknownContact_XPath"
    try:
        contact_element = driver.find_element(By.XPATH, contact_name_xpath)
        contact_name = contact_element.get_attribute('title').strip()
        if contact_name: return contact_name
        else: raise NoSuchElementException("Title attribute empty")
    except NoSuchElementException:
        try:
            contact_element = driver.find_element(By.XPATH, fallback_xpath)
            contact_name = contact_element.text.strip()
            if contact_name: return contact_name
            else: return default_name
        except Exception: return default_name
    except Exception as e:
        print(f"Error getting contact name (original method): {e}")
        return default_name

def check_and_click_unread_xpath(driver):
    xpath_unread_item = "//span[contains(@aria-label, 'unread message') or @aria-label='Unread']/ancestor::div[@role='listitem'][1]"
    try:
        unread_chat_element = driver.find_element(By.XPATH, xpath_unread_item)
        time.sleep(0.5)
        unread_chat_element.click()
        return True
    except NoSuchElementException: return False
    except (ElementNotInteractableException, StaleElementReferenceException) as e_click:
        print(f"Warning: Unread chat item found but couldn't click (original method): {e_click}")
        return False
    except Exception as e:
        print(f"Error during XPath unread check (original method): {e}")
        return False

def get_image_base64_from_blob_url(driver, blob_url):
    print(f"Attempting to fetch blob URL via JavaScript: {blob_url[:50]}...")
    if not blob_url.startswith("blob:"):
        print("Error: Provided URL is not a blob URL.")
        return None, None
    js_script = """
        async function getBase64FromBlobUrl(blobUrl) {
          try {
            const response = await fetch(blobUrl);
            if (!response.ok) {
                console.error(`Failed to fetch blob: ${response.status} ${response.statusText}`);
                return null;
            }
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = (error) => {
                  console.error('FileReader error:', error);
                  reject(error);
              };
              reader.readAsDataURL(blob);
            });
          } catch (e) {
            console.error('Error fetching or reading blob:', e);
            return null;
          }
        }
        const callback = arguments[arguments.length - 1];
        getBase64FromBlobUrl(arguments[0])
          .then(dataUrl => callback(dataUrl))
          .catch(error => callback(null));
        """
    try:
        data_url = driver.execute_async_script(js_script, blob_url)
        if data_url and data_url.startswith('data:image'):
            header, encoded = data_url.split(',', 1)
            mime_type = header.split(';')[0].split(':')[1]
            print(f"Successfully fetched blob and got base64 (Mime Type: {mime_type})")
            return encoded, mime_type
        elif data_url is None:
             print("Error: JavaScript callback returned null (fetch or read failed). Check browser console.")
             return None, None
        else:
            print(f"Error: JavaScript returned unexpected data: {str(data_url)[:100]}...")
            return None, None
    except TimeoutException:
        print("Error: JavaScript execution timed out waiting for blob fetch.")
        return None, None
    except JavascriptException as js_err:
        print(f"Error executing JavaScript to fetch blob: {js_err}")
        return None, None
    except Exception as e:
        print(f"Unexpected error getting image base64 from blob: {e}")
        return None, None

def save_image_from_base64(base64_data, mime_type, contact_name, base_folder="whatsapp_images"):
    filepath = None
    image_bytes = None
    try:
        if not os.path.exists(base_folder):
            os.makedirs(base_folder)
            print(f"Created base image folder: {base_folder}")
        safe_contact_name = "".join(c if c.isalnum() else "_" for c in contact_name)
        contact_folder = os.path.join(base_folder, safe_contact_name)
        if not os.path.exists(contact_folder):
            os.makedirs(contact_folder)
            print(f"Created contact image folder: {contact_folder}")
        image_bytes = base64.b64decode(base64_data)
        img = Image.open(io.BytesIO(image_bytes))
        extension = img.format.lower() if img.format else mime_type.split('/')[-1]
        if not extension: extension = 'png'
        if extension == 'jpeg': extension = 'jpg'
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"image_{timestamp}.{extension}"
        filepath = os.path.join(contact_folder, filename)
        img.save(filepath)
        print(f"Image saved successfully to: {filepath}")
        return filepath, image_bytes
    except (base64.binascii.Error, ValueError) as b64_err:
        print(f"Error decoding base64 data: {b64_err}")
        return None, None
    except UnidentifiedImageError:
         print("Error: Decoded data is not a valid image format.")
         return None, None
    except IOError as io_err:
        print(f"Error saving image file: {io_err}")
        return None, None
    except Exception as e:
        print(f"Unexpected error saving image: {e}")
        return None, None

def filter_scraped_text(text):
    if not text or not text.strip():
        return None
    text = text.strip()
    junk_patterns = [
        r"^\d{1,2}:\d{2}\s+(AM|PM)$",
        r"^tail-in$",
        r"^forward-chat$",
        r"^Select message$",
    ]
    for pattern in junk_patterns:
        if re.match(pattern, text, re.IGNORECASE):
            return None
    return text

def type_like_human(actions, text, wpm=240):
    if not text: return
    delay_per_char = 60 / (wpm * 5)
    for char in text:
        actions.send_keys(char)
        actions.pause(random.uniform(delay_per_char * 0.8, delay_per_char * 1.2))

def load_outreach_data(filename=OUTREACH_DATA_FILE):
    print(f"Loading outreach data from {filename}...")
    data = load_json(filename)
    if data is None:
        print(f"Warning: Outreach file {filename} not found or invalid. Creating empty list.")
        return []
    print(f"Loaded {len(data)} outreach contacts.")
    return data

def load_messaged_contacts(filename=MESSAGED_CONTACTS_FILE):
    messaged = set()
    if os.path.exists(filename):
        try:
            with open(filename, 'r', encoding='utf-8') as f:
                for line in f:
                    cleaned_line = line.strip()
                    if cleaned_line: messaged.add(cleaned_line)
            print(f"Loaded {len(messaged)} previously messaged contacts from {filename}.")
        except IOError as e: print(f"Error reading messaged contacts file {filename}: {e}")
    else: print(f"Messaged contacts file {filename} not found. Starting fresh.")
    return messaged

def add_messaged_contact(filename, phone_number):
    try:
        dir_name = os.path.dirname(filename)
        if dir_name: os.makedirs(dir_name, exist_ok=True)
        with open(filename, 'a', encoding='utf-8') as f: f.write(phone_number + '\n')
        print(f"Added {phone_number} to {filename}.")
        return True
    except IOError as e: print(f"Error writing to messaged contacts file {filename}: {e}"); return False
    except Exception as e: print(f"Unexpected error adding messaged contact to {filename}: {e}"); return False

def clean_phone_number(phone):
    if not phone: return None
    phone_str = str(phone).strip()
    if phone_str.startswith('+'): phone_str = phone_str[1:]
    elif phone_str.startswith('00'): phone_str = phone_str[2:]
    return ''.join(filter(str.isdigit, phone_str))

def generate_outreach_message(contact_data):
    print(f"Generating outreach message for: {contact_data.get('title', 'N/A')}")
    try:
        context_str = json.dumps(contact_data)
        response = outreach_model.generate_content(context_str)
        message = response.text.strip()
        if not message or len(message) < 10:
            print("Warning: AI generated a very short or empty outreach message.")
            return f"Hi, I saw your recent ad for {contact_data.get('title', 'your item/service')}. I'm Alex from Flowtiva, we help businesses automate tasks. Worth a quick chat?"
        print(f"Generated outreach message:\n{message}")
        return message
    except Exception as ai_err:
        print(f"ERROR during AI outreach message generation: {ai_err}")
        if hasattr(ai_err, 'response') and hasattr(ai_err.response, 'prompt_feedback'): print(f"    Prompt Feedback: {ai_err.response.prompt_feedback}")
        elif "safety" in str(ai_err).lower(): print("    (This might be due to safety filters.)")
        return f"Hi, I saw your recent ad for {contact_data.get('title', 'your item/service')}. I'm Alex from Flowtiva, we help businesses automate tasks. Worth a quick chat?"

# --- NEW/MODIFIED FUNCTION for sending messages to any contact (admin or outreach) ---
def send_message_to_whatsapp_contact(driver, phone_number, message_text, is_outreach=False, contact_data_for_outreach=None):
    """
    Opens a chat with the given phone_number and sends the message_text.
    Uses existing XPaths to minimize changes.
    If is_outreach is True, it will use contact_data_for_outreach to generate the message.
    Returns True if message sending was attempted, False otherwise.
    """
    print(f"\n--- Attempting to send message to: {phone_number} ---")
    cleaned_phone = clean_phone_number(phone_number)
    if not cleaned_phone:
        print(f"Invalid phone number format for sending message: {phone_number}")
        return False

    final_message_to_send = message_text
    if is_outreach:
        if not contact_data_for_outreach:
            print("Error: contact_data_for_outreach is required for outreach message.")
            return False
        final_message_to_send = generate_outreach_message(contact_data_for_outreach)
        if not final_message_to_send:
            print(f"Failed to generate outreach message for {cleaned_phone}. Skipping.")
            return False

    search_box = None
    try:
        print("Clicking 'New Chat'...")
        new_chat_button_xpath = "//span[@data-icon='new-chat-outline']/.."
        wait_long = WebDriverWait(driver, 20)
        try:
            new_chat_button = wait_long.until(EC.element_to_be_clickable((By.XPATH, new_chat_button_xpath)))
            print("Found 'New Chat' element, attempting JS click...")
            driver.execute_script("arguments[0].click();", new_chat_button)
            print("Clicked 'New Chat' successfully.")
            time.sleep(2.0)
        except TimeoutException:
            print(f"ERROR: Could not find or click the 'New Chat' button using XPath: {new_chat_button_xpath} after {wait_long._timeout} seconds.")
            return False
        except Exception as click_err:
            print(f"ERROR: An unexpected error occurred while clicking 'New Chat': {click_err}")
            return False

        print(f"Searching for number: {cleaned_phone}...")
        search_box_xpath = "//div[@aria-label='Search input textbox' or @aria-label='Search name or number'][@role='textbox']"
        search_box = wait_long.until(EC.element_to_be_clickable((By.XPATH, search_box_xpath)))
        search_box.clear()
        search_box.send_keys(cleaned_phone)
        time.sleep(1.0)

        print("Waiting for contact confirmation element...")
        confirmation_element_xpath = "//div[contains(@class, '_ak72')][@role='button']" # This class might change, it's for the contact item in search results
        wait_short = WebDriverWait(driver, 10) # Increased timeout slightly for confirmation
        try:
            contact_item = wait_short.until(EC.element_to_be_clickable((By.XPATH, confirmation_element_xpath)))
            print("Contact confirmation element found. Clicking it...")
            contact_item.click() # Click the contact item directly
            # search_box.send_keys(Keys.RETURN) # Old method, clicking item is more robust
            time.sleep(2.5)

            print("Waiting for message input box to appear...")
            message_box_xpath = "//div[@aria-label='Type a message'][@role='textbox']"
            message_box = WebDriverWait(driver, 15).until(EC.element_to_be_clickable((By.XPATH, message_box_xpath)))
            print("Message box found.")

            print(f"Typing and sending message to {cleaned_phone}...")
            actions = ActionChains(driver)
            actions.click(message_box)
            actions.pause(0.5)
            type_like_human(actions, final_message_to_send, wpm=250) # Consistent WPM
            actions.pause(0.5)
            actions.send_keys(Keys.RETURN)
            actions.perform()
            print(f"Message sent successfully to {cleaned_phone}.")
            time.sleep(1.0) # Short pause after sending

            # Optional: Refresh after sending, especially for admin messages or critical ones
            # print("Refreshing page after sending message...")
            # driver.refresh()
            # print("Waiting for page to reload...")
            # time.sleep(10) # Wait for page to reload fully

            return True # Message sending attempted

        except TimeoutException:
            print(f"Contact number {cleaned_phone} not found or no WhatsApp account (confirmation element timed out).")
            try:
                # Try to close the "New Chat" panel if contact not found
                close_button_xpath = "//button[@aria-label='Close' or @aria-label='Back']" # Common close/back button
                # More specific close for search panel if available:
                # close_search_panel_xpath = "//span[@data-icon='x-alt']/ancestor::button"
                close_button = WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.XPATH, close_button_xpath)))
                print("Attempting to close 'New Chat' panel (contact not found)...")
                driver.execute_script("arguments[0].click();", close_button)
                print("Closed 'New Chat' panel.")
                time.sleep(1)
            except Exception as close_err:
                print(f"Warning: Could not find or click close/back button after failed confirmation: {close_err}")
            return False # Contact not found
    except (NoSuchElementException, TimeoutException, ElementNotInteractableException) as e_ui:
        print(f"Error during UI interaction for sending message to {cleaned_phone}: {type(e_ui).__name__}")
    except Exception as e_send_msg:
        print(f"Unexpected error during message sending attempt for {cleaned_phone}: {e_send_msg}")
        import traceback; traceback.print_exc()
    # Ensure panel is closed if an error occurred mid-process
    try:
        # Check if search box is still visible, indicating panel might be open
        search_box_xpath = "//div[@aria-label='Search input textbox' or @aria-label='Search name or number'][@role='textbox']"
        if driver.find_element(By.XPATH, search_box_xpath).is_displayed():
            close_button_xpath = "//button[@aria-label='Close' or @aria-label='Back']"
            close_button = WebDriverWait(driver, 3).until(EC.element_to_be_clickable((By.XPATH, close_button_xpath)))
            print("Attempting to close 'New Chat' panel after error...")
            driver.execute_script("arguments[0].click();", close_button)
            print("Closed 'New Chat' panel.")
            time.sleep(1)
    except Exception:
        # print("Could not close 'New Chat' panel after error, or it was already closed.")
        pass
    return False


def perform_outreach_task(driver, outreach_data, messaged_contacts, messaged_contacts_file):
    print("\n--- Attempting Outreach Task ---")
    contact_messaged_this_cycle = False
    for contact in outreach_data:
        raw_phone = contact.get("whatsapp") or contact.get("phone")
        if not raw_phone: continue
        cleaned_phone = clean_phone_number(raw_phone)
        if not cleaned_phone: print(f"Skipping contact (invalid phone format): {raw_phone}"); continue
        if cleaned_phone in messaged_contacts: continue

        print(f"Found new contact for outreach: {cleaned_phone} ({contact.get('title', 'N/A')})")
        # Use the new generic message sending function for outreach
        message_sent = send_message_to_whatsapp_contact(driver,
                                                        cleaned_phone,
                                                        message_text=None, # Will be generated by AI
                                                        is_outreach=True,
                                                        contact_data_for_outreach=contact)
        if message_sent:
            # Refresh after successful outreach send
            print("Refreshing page after sending outreach...")
            driver.refresh()
            print("Waiting for page to reload...")
            time.sleep(10) # Wait for page to reload fully

            if add_messaged_contact(messaged_contacts_file, cleaned_phone):
                messaged_contacts.add(cleaned_phone)
                contact_messaged_this_cycle = True
                print(f"Successfully processed and marked {cleaned_phone} as messaged.")
            else:
                print(f"Warning: Message sent to {cleaned_phone}, but failed to write to tracking file.")
            break # Process one outreach per cycle
        else:
            print(f"Failed to send outreach to {cleaned_phone}. Trying next if available.")
            # No break here, try next contact if current one failed (e.g., number not on WhatsApp)

    if not contact_messaged_this_cycle:
        print("No new contacts found or processed in this outreach cycle.")
    print("--- Finished Outreach Task Attempt ---")
    return contact_messaged_this_cycle

# --- NEW FUNCTION to handle closing sequence ---
def handle_closing_sequence(driver, chat_history_for_summary, contact_name, ai_model_instance):
    print(f"Initiating closing sequence for {contact_name}: Summarizing and notifying admin.")

    # 1. Summarize conversation
    # Prepare history for summarization model
    # The history should be a list of Content objects (role, parts)
    contents_for_summary = []
    # Add the summarization system instruction first as a user message to guide the one-off call
    contents_for_summary.append({"role": "user", "parts": [system_prompt_summarize_for_admin]})

    # Then add the actual chat history
    # Filter out any old system prompts if they are still in historical JSONs
    for message in chat_history_for_summary:
        is_old_system_prompt = (message["role"] == "user" and
                                "You are Alex, Senior Solutions Architect at Flowtiva." in message["parts"][0] and
                                len(contents_for_summary) == 1) # Only skip if it's the first after our summarizer prompt
        if not is_old_system_prompt:
            contents_for_summary.append(message)

    # Add a final instruction for the summarizer
    contents_for_summary.append({"role": "user", "parts": [f"Please summarize the above conversation with {contact_name}. Identify key client needs, pain points, their business type if mentioned, and any explicit interest shown in Flowtiva's services. What should the admin know before following up? Focus on actionable insights for the admin."]})

    summary_text = f"Error generating summary for {contact_name}."
    try:
        print(f"Generating summary for {contact_name} with {len(contents_for_summary)} history parts...")
        # Use generate_content for a one-shot summary
        # We pass the summarization prompt as part of the contents
        summary_response = ai_model_instance.generate_content(
            contents_for_summary,
            generation_config=summarization_model_config # Use specific config for summary
        )
        summary_text = summary_response.text.strip()
        if not summary_text:
            summary_text = f"AI returned an empty summary for {contact_name}."
        print(f"Conversation Summary for {contact_name}:\n{summary_text}")
    except Exception as e:
        print(f"Error generating summary for admin: {e}")
        if hasattr(e, 'response') and hasattr(e.response, 'prompt_feedback'): print(f"    Prompt Feedback: {e.response.prompt_feedback}")
        summary_text = f"Could not automatically summarize chat with {contact_name}. Please review manually. Error: {str(e)}"

    # 2. Send summary to admin
    admin_message = f"--- Client Interaction Summary ---\nContact: {contact_name}\n\n{summary_text}\n\n--- End of Summary ---"
    if send_message_to_whatsapp_contact(driver, ADMIN_PHONE_NUMBER, admin_message):
        print(f"Summary for {contact_name} sent to admin ({ADMIN_PHONE_NUMBER}).")
        # Refresh after sending to admin
        print("Refreshing page after sending summary to admin...")
        driver.refresh()
        print("Waiting for page to reload...")
        time.sleep(10)
    else:
        print(f"Failed to send summary for {contact_name} to admin ({ADMIN_PHONE_NUMBER}).")


# ---- Main Script ----
def run_whatsapp_automation():
    logged_in = False
    os.makedirs(CHAT_HISTORY_BASE_FOLDER, exist_ok=True)
    os.makedirs(IMAGE_BASE_FOLDER, exist_ok=True)

    try:
        print("Checking WhatsApp Web login status...")
        driver.get("https://web.whatsapp.com/")
        try:
            chat_list_xpath = "//div[@aria-label='Chat list']"
            main_search_xpath = "//div[@aria-label='Search input textbox'][@role='textbox'][@data-tab='3']"
            wait_login = WebDriverWait(driver, 45)
            wait_login.until(EC.any_of(
                EC.presence_of_element_located((By.XPATH, chat_list_xpath)),
                EC.presence_of_element_located((By.XPATH, main_search_xpath))
            ))
            print("Already logged in (found chat list or main search).")
            logged_in = True
        except TimeoutException:
            print("Not logged in or main interface didn't load in time.")
            print("Please log in manually or via the phone number method if needed.")
            print("\n--- Attempting Log in with phone number (Original Method Style) ---")
            xpath_login = "//div[contains(text(), 'Log in with phone number')]"
            try:
                login_element = WebDriverWait(driver, 3).until(EC.element_to_be_clickable((By.XPATH, xpath_login)))
                login_element.click()
                print("Clicked 'Log in with phone number'.")
                time.sleep(2)
                xpath_phone_input = "//input[@aria-label='Type your phone number.']"
                phone_number_to_input = "74461607"
                phone_input_element = WebDriverWait(driver, 3).until(EC.element_to_be_clickable((By.XPATH, xpath_phone_input)))
                phone_input_element.clear()
                phone_input_element.send_keys(phone_number_to_input)
                print(f"Inputted phone number '{phone_number_to_input}'.")
                time.sleep(1)
                phone_input_element.send_keys(Keys.RETURN)
                print("Sent Enter key to submit phone number.")
                manual_wait_time = 20
                print(f"\n--- Waiting {manual_wait_time} seconds for manual account linking on your phone ---")
                print("Please check your phone and approve the login request.")
                time.sleep(manual_wait_time)
                wait_login.until(EC.any_of(
                    EC.presence_of_element_located((By.XPATH, chat_list_xpath)),
                    EC.presence_of_element_located((By.XPATH, main_search_xpath))
                ))
                print("Login successful after phone linking.")
                logged_in = True
            except (NoSuchElementException, TimeoutException, ElementNotInteractableException) as login_err:
                print(f"ERROR during phone login attempt: {login_err}")
                print("Login failed. Please ensure WhatsApp Web is logged in manually.")
            except Exception as e:
                 print(f"Unexpected error during login steps: {e}")

        if logged_in:
            print("\n=========== STARTING MAIN CHECK LOOP ===========")
            fast_check_interval = 10
            slow_check_interval = 20
            current_check_interval = fast_check_interval
            max_fast_checks_without_activity = 7
            fast_check_count = 0
            outreach_data = load_outreach_data(OUTREACH_DATA_FILE)
            messaged_contacts = load_messaged_contacts(MESSAGED_CONTACTS_FILE)

            while True:
                print(f"\n--- Check Cycle Start (Interval: {current_check_interval}s) ---")
                processed_unread_in_cycle = False
                ai_reply_generated_this_cycle = False

                while True:
                    unread_clicked = False
                    try:
                        unread_clicked = check_and_click_unread_xpath(driver)
                    except Exception as check_click_err:
                        print(f"ERROR during unread check/click function call: {check_click_err}.")
                        time.sleep(5)

                    if unread_clicked:
                        print(">>> Unread chat clicked. Processing...")
                        processed_unread_in_cycle = True
                        fast_check_count = 0
                        current_check_interval = fast_check_interval
                        json_updated_this_chat = False
                        new_messages_found_count = 0
                        json_filename_this_chat = None
                        existing_chat_history = []
                        reply_sent_this_chat = False # Tracks if a reply was sent to the *client*
                        contact_name = "Unknown"
                        processed_image_info_this_cycle = None

                        try:
                            time.sleep(5)
                            print("Processing opened chat...")
                            contact_name = get_contact_name_with_xpath(driver)
                            if not contact_name or contact_name == "UnknownContact_XPath":
                                print("WARNING: Could not get contact name. Skipping chat.")
                                time.sleep(3); continue
                            safe_contact_name = "".join(c if c.isalnum() else "_" for c in contact_name)
                            if not safe_contact_name: safe_contact_name = "unknown_contact"
                            json_filename_this_chat = os.path.join(CHAT_HISTORY_BASE_FOLDER, f"whatsapp_chat_{safe_contact_name}.json")
                            print(f"Chat with: {contact_name} (File: {json_filename_this_chat})")
                            print(f"Loading history...")
                            existing_chat_history = load_json(json_filename_this_chat)
                            if existing_chat_history is None:
                                print(f"Initializing history for {contact_name}.")
                                existing_chat_history = [] # Start with empty history; system prompt is in model
                                save_json(existing_chat_history, json_filename_this_chat)
                            else:
                                print(f"Loaded {len(existing_chat_history)} messages.")

                            print("Scraping visible messages...")
                            scraped_items = []
                            try:
                                html_content_chat_pane = driver.page_source
                                soup = BeautifulSoup(html_content_chat_pane, 'html.parser')
                                chat_container = soup.find('div', {'data-tab': '8', 'role': 'application'})
                                if not chat_container:
                                    main_div = soup.find('div', id='main')
                                    if main_div: chat_container = main_div
                                    else: print("Error: Could not find chat container.")
                                message_divs = []
                                if chat_container:
                                    message_divs = chat_container.find_all('div', class_=lambda c: c and ('message-in' in c.split() or 'message-out' in c.split()))
                                else: print("Skipping scraping as container not found.")
                                print(f"Found {len(message_divs)} potential message divs.")
                                for msg_div in message_divs:
                                    role = "unknown"
                                    if 'message-out' in msg_div.get('class', []): role = "model"
                                    elif 'message-in' in msg_div.get('class', []): role = "user"
                                    if role == "unknown": continue
                                    img_tag = msg_div.find('img', {'src': lambda s: s and s.startswith('blob:')})
                                    image_processed = False
                                    if img_tag and role == "user":
                                        blob_url = img_tag['src']
                                        print(f"Found potential image tag with blob URL: {blob_url[:60]}...")
                                        base64_data, mime_type = get_image_base64_from_blob_url(driver, blob_url)
                                        if base64_data and mime_type:
                                            filepath, image_bytes = save_image_from_base64(base64_data, mime_type, contact_name, IMAGE_BASE_FOLDER)
                                            if filepath and image_bytes:
                                                image_processed = True
                                                scraped_items.append({"type": "image", "role": role, "filepath": filepath, "mime_type": mime_type, "image_bytes": image_bytes})
                                                caption_text = ""
                                                caption_span = msg_div.find('span', class_='_ao3e selectable-text copyable-text')
                                                if caption_span: caption_text = filter_scraped_text(caption_span.get_text(separator='\n', strip=True))
                                                if caption_text:
                                                     print(f"Found caption for image: {caption_text}")
                                                     scraped_items.append({"type": "text", "role": role, "parts": [caption_text]})
                                            else: print("Failed to save image from extracted data.")
                                        else: print("Failed to extract base64 data from blob URL.")
                                        if image_processed: continue
                                    if not image_processed:
                                        message_text = ""
                                        text_span = msg_div.find('span', class_='_ao3e selectable-text copyable-text')
                                        copyable_text_div = msg_div.find('div', class_='copyable-text')
                                        if text_span: message_text = text_span.get_text(separator='\n', strip=True)
                                        elif copyable_text_div:
                                            inner_span = copyable_text_div.find('span', class_='_ao3e')
                                            if inner_span: message_text = inner_span.get_text(separator='\n', strip=True)
                                            else: message_text = copyable_text_div.get_text(separator='\n', strip=True)
                                        else: message_text = msg_div.get_text(separator='\n', strip=True)
                                        filtered_text = filter_scraped_text(message_text)
                                        if filtered_text:
                                            scraped_items.append({"type": "text", "role": role, "parts": [filtered_text]})
                            except Exception as scrape_err:
                                 print(f"ERROR during message scraping loop for {contact_name}: {scrape_err}")
                                 scraped_items = []
                            if scraped_items:
                                try:
                                    existing_message_texts = set(
                                        msg['parts'][0] for msg in existing_chat_history if msg.get('parts') and isinstance(msg['parts'], list) and msg['parts'] and isinstance(msg['parts'][0], str)
                                    )
                                except Exception as set_err:
                                     print(f"Warning: Error creating set from existing history: {set_err}. Skipping duplicate check.")
                                     existing_message_texts = set()
                                newly_added_history_entries = []
                                processed_image_info_this_cycle = None
                                for item in scraped_items:
                                    history_entry = None; is_new = False
                                    if item["type"] == "text":
                                        scraped_text = item['parts'][0]
                                        if scraped_text not in existing_message_texts:
                                            history_entry = {"role": item["role"], "parts": item["parts"]}; is_new = True
                                            existing_message_texts.add(scraped_text)
                                    elif item["type"] == "image" and item["role"] == "user":
                                        processed_image_info_this_cycle = item
                                        placeholder_text = f"<Image received: {os.path.basename(item['filepath'])}>"
                                        if placeholder_text not in existing_message_texts:
                                            history_entry = {"role": item["role"], "parts": [placeholder_text]}; is_new = True
                                            existing_message_texts.add(placeholder_text)
                                    if is_new and history_entry:
                                        existing_chat_history.append(history_entry)
                                        newly_added_history_entries.append(history_entry)
                                new_messages_found_count = len(newly_added_history_entries)
                                print(f"Processed {len(scraped_items)} items. Appended {new_messages_found_count} new entries to history.")
                                if new_messages_found_count > 0:
                                    if save_json(existing_chat_history, json_filename_this_chat): json_updated_this_chat = True
                                    else: print(f"ERROR saving history for {contact_name}")
                                else:
                                    if scraped_items: print("No new text/images detected (already in history or filtered).")
                                    else: print("No text or processable images scraped from view.")
                                    json_updated_this_chat = True
                            else:
                                print("No valid text or images scraped."); json_updated_this_chat = True
                        except Exception as process_chat_err:
                            print(f"ERROR processing chat with {contact_name}: {process_chat_err}")
                            json_updated_this_chat = False

                        if json_updated_this_chat and existing_chat_history:
                            print(f"Checking last history entry for AI reply. Last entry: {existing_chat_history[-1]}")
                            last_entry = existing_chat_history[-1]
                            send_to_ai = False
                            chat_session = None
                            new_content_parts_for_ai = []
                            max_history_len_for_ai = 20 # Keep recent context for AI
                            
                            # Prepare history for the AI model (excluding system prompts if any are still in JSON)
                            history_context_for_ai = [
                                msg for msg in existing_chat_history
                                if not (msg["role"] == "user" and system_prompt_reply in msg["parts"][0]) # Filter out old system prompts
                            ]
                            history_context_for_ai = history_context_for_ai[-max_history_len_for_ai:]


                            if last_entry.get("role") == "user": # Only reply to user messages
                                send_to_ai = True
                                chat_session = jayakrishnan_reply_model.start_chat(history=history_context_for_ai[:-1]) # History up to before last user msg
                                new_content_parts_for_ai = []

                                if last_entry["parts"][0].startswith("<Image received") and processed_image_info_this_cycle:
                                    print("Last entry is new image placeholder. Preparing multimodal AI call.")
                                    try:
                                        if "image_bytes" in processed_image_info_this_cycle:
                                            img_object = Image.open(io.BytesIO(processed_image_info_this_cycle["image_bytes"]))
                                            new_content_parts_for_ai.append(img_object)
                                        else: print("Warning: Image bytes not found for AI call."); send_to_ai = False
                                        
                                        caption_text = "" # Try to find associated caption
                                        current_item_index = -1
                                        for i, h_item in enumerate(existing_chat_history):
                                            if h_item["parts"][0] == last_entry["parts"][0]: # Find the image placeholder
                                                current_item_index = i; break
                                        if current_item_index != -1 and current_item_index + 1 < len(existing_chat_history):
                                            next_h_item = existing_chat_history[current_item_index + 1]
                                            if next_h_item["role"] == "user" and not next_h_item["parts"][0].startswith("<Image received"):
                                                caption_text = next_h_item["parts"][0]
                                                print(f"Found associated caption in history: {caption_text}")
                                        
                                        if caption_text: new_content_parts_for_ai.append(f"User sent this image with the caption: '{caption_text}'. Describe the image and respond to the caption contextually.")
                                        elif send_to_ai: new_content_parts_for_ai.append("User sent this image. Describe it briefly and respond contextually based on the conversation.")
                                    except Exception as img_load_err: print(f"Error loading image bytes for AI: {img_load_err}"); send_to_ai = False
                                else: # It's a text message from user
                                    print("Last entry is user text. Preparing text-only AI call.")
                                    new_content_parts_for_ai = last_entry["parts"]
                            else:
                                print("Last entry was from model or old image placeholder. No AI reply needed.")

                            if send_to_ai and chat_session and new_content_parts_for_ai:
                                ai_reply_generated_this_cycle = True
                                try:
                                    print(f"Sending new content to AI: {new_content_parts_for_ai}")
                                    response = chat_session.send_message(new_content_parts_for_ai)
                                    jarvis_reply = response.text.strip()
                                    reply_to_client = jarvis_reply # Default

                                    if jarvis_reply:
                                        print(f"\n>>> Alex AI Reply for {contact_name}:\n{jarvis_reply}\n")
                                        
                                        # --- HANDLE CLOSING SEQUENCE TRIGGER ---
                                        if jarvis_reply.endswith(FLOWTIVA_CLOSING_TRIGGER):
                                            print(f"Detected Flowtiva closing sequence for {contact_name}.")
                                            reply_to_client = jarvis_reply[:-len(FLOWTIVA_CLOSING_TRIGGER)].strip()
                                            
                                            # Call handler function (pass the model instance for summarization)
                                            # Pass existing_chat_history which includes the user's message that triggered this
                                            handle_closing_sequence(driver, existing_chat_history, contact_name, jayakrishnan_reply_model)
                                            # The closing sequence handler will do its own refresh if it sends to admin.
                                            # We still need to send the (modified) reply to the client.
                                        
                                        if reply_to_client: # Send to client if there's anything left after trigger removal
                                            print("Sending reply to client via ActionChains...")
                                            try:
                                                message_box_xpath = "//div[@aria-label='Type a message'][@role='textbox']"
                                                message_box = WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.XPATH, message_box_xpath)))
                                                actions = ActionChains(driver); actions.click(message_box); actions.pause(0.3)
                                                type_like_human(actions, reply_to_client, wpm=240)
                                                actions.pause(0.5); actions.send_keys(Keys.RETURN); actions.perform()
                                                print("Reply sent to client.")
                                                reply_sent_this_chat = True # Tracks reply to client

                                                time.sleep(0.5)
                                                print("Refreshing page after sending reply to client...")
                                                driver.refresh()
                                                print("Waiting for page to reload (8s)...")
                                                time.sleep(8)

                                                ai_reply_message = {"role": "model", "parts": [reply_to_client]}
                                                existing_chat_history.append(ai_reply_message)
                                                print("Saving history again including AI's reply to client...")
                                                save_json(existing_chat_history, json_filename_this_chat)
                                            except Exception as send_err: print(f"ERROR sending reply to client: {send_err}")
                                        else:
                                            print("AI reply was empty after removing trigger, or original reply was empty. Not sending to client.")
                                            # If only trigger, no client reply, but admin sequence was handled.
                                            # We might need a refresh here if no client reply was sent but admin sequence ran.
                                            # The handle_closing_sequence does its own refresh.

                                    else: print("AI generated an empty reply. Not sending.")
                                except Exception as ai_err:
                                     print(f"ERROR during AI content generation for {contact_name}: {ai_err}")
                                     if hasattr(ai_err, 'response') and hasattr(ai_err.response, 'prompt_feedback'): print(f"    Prompt Feedback: {ai_err.response.prompt_feedback}")
                                     elif "safety" in str(ai_err).lower(): print("    (This might be due to safety filters.)")
                        elif not existing_chat_history:
                              print("Cannot generate reply: Chat history is empty or failed.")
                        print(f"--- Finished processing chat with {contact_name} ---")
                    else: break # No more unread chats

                if processed_unread_in_cycle:
                    current_check_interval = fast_check_interval; fast_check_count = 0
                else:
                    if current_check_interval == fast_check_interval:
                        fast_check_count += 1
                        print(f"No activity during fast check cycle {fast_check_count}/{max_fast_checks_without_activity}.")
                        if fast_check_count >= max_fast_checks_without_activity:
                            print(f"Switching to slow check interval ({slow_check_interval}s) for outreach.")
                            current_check_interval = slow_check_interval; fast_check_count = 0
                
                if current_check_interval == slow_check_interval and not processed_unread_in_cycle and not ai_reply_generated_this_cycle:
                    outreach_sent = perform_outreach_task(driver, outreach_data, messaged_contacts, MESSAGED_CONTACTS_FILE)

                print(f"--- Check Cycle End. Waiting {current_check_interval} seconds... ---")
                time.sleep(current_check_interval)
        else:
            print("\n❌ Critical Error: Not logged into WhatsApp Web. Cannot start main loop.")
            print("Please ensure you are logged in (QR code or phone link) and restart the script.")

    except WebDriverException as wd_err:
         print(f"\n❌ FATAL WebDriver Error: {wd_err}")
         print("The browser might have crashed or become unresponsive.")
         try:
             ts = time.strftime("%Y%m%d-%H%M%S"); screenshot_path = f"error_screenshot_webdriver_{ts}.png"
             if driver.save_screenshot(screenshot_path): print(f"Saved screenshot: {screenshot_path}")
             else: print("Failed to save screenshot.")
         except Exception as ss_e: print(f"Could not save screenshot: {ss_e}")
    except KeyboardInterrupt: print("\nScript interrupted by user (Ctrl+C).")
    except Exception as e:
        print(f"\n❌ FATAL Unhandled Error in Main Execution: {type(e).__name__}: {e}")
        import traceback; traceback.print_exc()
        try:
            ts = time.strftime("%Y%m%d-%H%M%S"); screenshot_path = f"error_screenshot_fatal_{ts}.png"
            if driver.save_screenshot(screenshot_path): print(f"Saved screenshot: {screenshot_path}")
            else: print("Failed to save screenshot.")
        except Exception as ss_e: print(f"Could not save screenshot during fatal error handling: {ss_e}")

    print("\n--- Script Execution Summary ---")
    print(f"Login Status: {'✅ Logged In' if logged_in else '❌ Not Logged In / Failed'}")
    print(f"Outreach Data File ({OUTREACH_DATA_FILE}): {'Found' if os.path.exists(OUTREACH_DATA_FILE) else 'Not Found'}")
    print(f"Messaged Contacts File ({MESSAGED_CONTACTS_FILE}): {'Found' if os.path.exists(MESSAGED_CONTACTS_FILE) else 'Not Found / Will be Created'}")
    print(f"Chat History Folder: {CHAT_HISTORY_BASE_FOLDER}")
    print(f"Image Folder: {IMAGE_BASE_FOLDER}")
    print("---")

if __name__ == "__main__":
    driver_instance = None
    try:
        if 'driver' in locals() and driver is not None: driver_instance = driver
        run_whatsapp_automation()
        print("\nScript main function completed.")
    except Exception as main_exec_err:
        print(f"\n❌ An unexpected error occurred at the top level: {main_exec_err}")
        import traceback; traceback.print_exc()
    finally:
        print("\n--- Starting Cleanup ---")
        if driver_instance:
            try:
                current_url = driver_instance.current_url
                print(f"Browser still reachable at: {current_url}. Attempting to close...")
                driver_instance.quit()
                print("Browser closed successfully.")
            except WebDriverException as quit_e:
                 if "cannot determine loading status" in str(quit_e).lower() or \
                    "target window already closed" in str(quit_e).lower() or \
                    "disconnected" in str(quit_e).lower() or \
                    "session deleted because of page crash" in str(quit_e).lower() or \
                    "unable to connect to renderer" in str(quit_e).lower():
                     print(f"Browser seems to be already closed or disconnected: {type(quit_e).__name__}")
                 else: print(f"WebDriverException during quit (browser might be unresponsive): {quit_e}")
            except Exception as quit_e_other: print(f"Unexpected error closing browser during cleanup: {quit_e_other}")
        else: print("Driver instance was not available for cleanup.")
        print("Script finished.")
        sys.exit(0)
