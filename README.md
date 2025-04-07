# Simple Process Historian Viewer 📊

A lightweight, browser-based application for visualizing industrial process data (alarms/events and trends) from CSV files. This application was initially generated with the assistance of Google Gemini 2.5 and provides a basic interface inspired by industrial control system historians, based on the data from the Tennessee Eastman Process (TEP) benchmark.

It consists of two main views:

1.  **Alarms and Events:** Load, filter, sort, and inspect alarm data. Includes AI-powered explanations for alarm descriptions (requires OpenAI API key).
2.  **Trends:** Load time-series data, plot multiple tags interactively using D3.js, and correlate with alarm occurrences.

---

## ✨ Features

**Alarms & Events Page (`alarms.html`)**

*   **Load Data:** Source alarm/event data directly from a local CSV file.
*   **Filtering:** Filter alarms by:
    *   Start Date & Time
    *   End Date & Time
    *   Tag Name (partial match)
    *   Alarm Condition/Type (partial match)
    *   Description (partial match)
*   **Sorting:** Click table headers to sort data by any column (Timestamp, Tag, Type, Description, etc.) in ascending or descending order.
*   **Critical Alarm Highlighting:** Rows with `HH` (High-High) or `LL` (Low-Low) types are visually highlighted.
*   **AI-Powered Explanations:** Click on an alarm row to expand and view additional details. If an OpenAI API key is configured, it fetches a detailed explanation, potential risks, and suggested operator actions from GPT-4o-mini (or specified model), formatted using Markdown.
*   **Responsive Table:** Basic table layout adjusts to content.

**Trends Page (`trends.html`)**

*   **Load Data:** Source time-series trend data from a local CSV file.
*   **Interactive Charting (D3.js):**
    *   Visualize multiple tags on a single time-series chart.
    *   Y-axes dynamically added per tag, showing original value ranges.
    *   Percentage-based internal scaling for plotting multiple tags with different ranges effectively.
*   **Tag Selection:**
    *   Search available tags from the loaded CSV.
    *   Add/Remove tags to/from the plot individually.
    *   Color-coded lines and axes corresponding to each tag.
*   **Zoom & Pan:** Use mouse wheel or touch gestures to zoom in/out and pan the chart horizontally.
*   **Interactive Tooltip:** Hover over the chart to see a tooltip displaying the timestamp and the corresponding original values for all plotted tags at that point.
*   **Persistent Cursor:** Click on the chart to place a persistent vertical cursor at a specific timestamp.
*   **Alarm Overlay:**
    *   Load a *separate* alarms CSV file.
    *   When the persistent cursor is active, relevant alarms occurring within a +/- 1 hour window around the cursor's timestamp are displayed in a table below the chart.
*   **Date Range Filtering:** Filter the displayed trend data using start/end date-time pickers.
*   **Responsive Layout:** Chart and controls adjust to different screen sizes.

**General**

*   **Frontend Only:** Runs entirely in the web browser. No backend server required for basic functionality (except for the AI explanation feature).
*   **GCP-Inspired UI:** Clean user interface styled with CSS, taking cues from Google Cloud Platform design.
*   **CSV Parsing:** Uses PapaParse for robust client-side CSV file handling.
*   **Markdown Rendering:** Uses Marked.js to render AI-generated explanations with formatting.

---

## 🚀 Getting Started

This application is designed to run directly in your web browser from local files.

**Prerequisites:**

*   A modern web browser (Chrome, Firefox, Edge, Safari).

**Setup:**

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Antonizitron/sample_historian.git
    cd sample_historian
    ```

2.  **(Optional but Recommended) Use a Local Web Server:** While you can open the `.html` files directly, browsers have security restrictions (CORS) that *might* interfere with some operations, especially if you modify the code to fetch resources dynamically. Running a simple local server is often better:
    *   **Using Python:**
        ```bash
        # Python 3.x
        python -m http.server
        # Python 2.x
        python -m SimpleHTTPServer
        ```
        Then navigate to `http://localhost:8000` (or the port specified) in your browser and click on `alarms.html` or `trends.html`.
    *   **Using Node.js (with `http-server`):**
        ```bash
        npm install --global http-server
        http-server . -o
        ```
    *   **Using VS Code:** Use the "Live Server" extension.

3.  **Open the Application:**
    *   Navigate to `alarms.html` for the Alarms and Events view.
    *   Navigate to `trends.html` for the Trends view.

4.  **(CRITICAL - OpenAI API Key)**
    *   The **Alarms Page** uses the OpenAI API to provide explanations.
    *   The API key is currently hardcoded in `alarms.js` (variable `OPENAI_API_KEY`).
    *   **🚨 SECURITY WARNING:** **NEVER commit your real OpenAI API key directly into client-side JavaScript in a public repository or production application.** This is **extremely insecure**.
    *   **For Local Testing ONLY:** Replace the placeholder `"YOUR_OPENAI_API_KEY_HERE"` (or the example key provided) in `alarms.js` with your actual OpenAI key.
    *   **For Deployment/Sharing:** You **MUST** implement a backend proxy server to handle OpenAI API requests securely. The frontend should call your proxy, and the proxy should securely add the API key and forward the request to OpenAI.

---

## 💡 Usage

**Alarms Page (`alarms.html`)**

1.  Click the "Source Alarms" button and select your alarms CSV file.
2.  Wait for the table to load.
3.  Use the filter controls (Date, Tag, Type, Description) and click "Search" to narrow down the results.
4.  Click "Reset" to clear filters and show all alarms.
5.  Click any table header (e.g., "Timestamp", "Tag") to sort the *currently displayed* data. Click again to reverse the sort order.
6.  Click anywhere on an alarm row (that isn't the header) to expand it.
7.  If the OpenAI API key is correctly configured, an explanation will be fetched and displayed in the expanded area. Otherwise, a loading message or error will appear. Clicking the same row again or applying new filters/sorts will collapse the details.

**Trends Page (`trends.html`)**

1.  Click the "Source Trends" button and select your trends CSV file.
2.  Wait for the data to load. The chart area will initially show a message.
3.  Use the "Plot Controls" section:
    *   Optionally set the "Start Date" and "End Date" filters to limit the time range shown on the chart. The chart will update automatically.
    *   In the "Find Tag" input, type or select a tag name from the list (populated from your CSV headers).
    *   Click the "+" button (Add Tag) to plot the selected tag. Repeat to add multiple tags.
    *   Added tags appear in the "Currently Plotted Tags" list. Click the "-" button next to a tag to remove it from the plot.
4.  Interact with the chart:
    *   **Zoom:** Use your mouse wheel or pinch-zoom on touch devices.
    *   **Pan:** Click and drag the chart horizontally.
    *   **Hover:** Move your mouse over the chart to see values for plotted tags at specific times in the tooltip.
    *   **Click:** Click on the chart to set a persistent vertical cursor.
5.  (Optional) Load Alarms for Correlation:
    *   Click the "Source Alarms" button (below the plot controls) and select your alarms CSV file.
    *   If a persistent cursor is active on the chart, alarms within +/- 1 hour of the cursor's time will appear in a table at the bottom of the page. This display updates if you click a new location on the chart or remove the cursor (by clicking it again).

---

## 🔮 Potential Future Improvements

*   **Secure API Key Handling:** Implement a backend proxy for OpenAI API calls.
*   **Performance:** Optimize JavaScript for handling very large CSV files (e.g., using web workers, data chunking, virtual scrolling for tables).
*   **State Management:** Save/load chart configurations (plotted tags, zoom level).
*   **Chart Enhancements:** Add features like multiple Y-axis scaling options, annotations, event markers directly on the trend.
*   **Error Handling:** More user-friendly feedback for invalid CSV formats or API errors.
*   **Unit/Integration Tests:** Add automated tests.
*   **Configuration:** Allow users to configure the AI model, prompt, or time window for alarm correlation.
