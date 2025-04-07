document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const csvFileInput = document.getElementById('csvFileInput');
    const sourceButton = document.getElementById('sourceButton');
    const tableContainer = document.getElementById('tableContainer');
    const searchButton = document.getElementById('searchButton');
    const resetButton = document.getElementById('resetButton');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const tagFilterInput = document.getElementById('tagFilter');
    const typeFilterInput = document.getElementById('typeFilter');
    const descFilterInput = document.getElementById('descFilter');


    // --- OpenAI API Configuration ---
    // !!! IMPORTANT: DO NOT HARDCODE YOUR REAL API KEY HERE IN PRODUCTION CLIENT-SIDE CODE !!!
    // !!! Use a backend proxy for security !!!
    // !!! For local testing only, replace "YOUR_OPENAI_API_KEY_HERE" with your actual key. !!!
    const OPENAI_API_KEY = "aaabbbccc127"; // <-- Replace with your key ONLY for local testing. Or better use Env Vars...
    const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

    // --- Global State ---
    let originalAlarmData = []; // Stores the full, processed dataset from CSV
    let originalHeaders = [];   // Stores the headers as parsed from CSV
    let currentSortColumn = null; // Key/header of the currently sorted column
    let currentSortDirection = 'none'; // 'none', 'asc', 'desc'
    let currentlyDisplayedData = []; // Stores the data array currently shown in the table (filtered/sorted)
    let expandedRowElement = null; // Reference to the TR element of the expanded details row
    let activeDataRowElement = null; // Reference to the data TR element whose details are expanded

    // --- Event Listeners ---
    sourceButton.addEventListener('click', () => csvFileInput.click());
    csvFileInput.addEventListener('change', handleFileSelect);
    searchButton.addEventListener('click', filterAndDisplayData); // Search triggers filter + display
    resetButton.addEventListener('click', resetFiltersAndDisplayAll); // Reset triggers reset + display

    // Enter key listener for filter inputs
    const filterInputs = [startDateInput, endDateInput, tagFilterInput, typeFilterInput, descFilterInput];
    filterInputs.forEach(input => {
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.keyCode === 13) { // keyCode for older browser compatibility
                event.preventDefault(); // Prevent default Enter behavior
                filterAndDisplayData(); // Call the same function as the search button
            }
        });
    });

    // Table Body Click Listener (Event Delegation for row expansion)
    tableContainer.addEventListener('click', handleTableClick);


    // --- Helper Functions ---
    function formatDateForDisplay(date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) return ''; // Handle invalid dates
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    function parseTimestamp(tsString) {
        if (!tsString || typeof tsString !== 'string') return null;
        try {
            // Format: 2024-05-01 00:00:20.000000000
            const parts = tsString.split('.');
            const dateTimePart = parts[0];
            // JS Date needs milliseconds (3 digits). Truncate/round nanoseconds.
            const milliseconds = parts.length > 1 ? parts[1].substring(0, 3) : '000';
            // Replace space with 'T' for better ISO-like format compatibility
            const isoLikeString = `${dateTimePart.replace(' ', 'T')}.${milliseconds}`;
            const date = new Date(isoLikeString);
            // Check if the created date is valid
            if (isNaN(date.getTime())) {
                console.warn(`Could not parse timestamp string: "${tsString}" into a valid Date.`);
                return null;
            }
            return date;
        } catch (e) {
            console.error(`Error parsing timestamp string: "${tsString}"`, e);
            return null;
        }
    }

    // --- OpenAI API Call Function ---
    async function getOpenAIExplanation(description, cellElement) {
        if (!OPENAI_API_KEY || OPENAI_API_KEY === "YOUR_OPENAI_API_KEY_HERE") {
            cellElement.innerHTML = `<span class="error-text">Error: OpenAI API key not configured in script.js. Please add your key for local testing (do not deploy with key in frontend code).</span>`;
            console.error("OpenAI API Key missing or is placeholder.");
            return;
        }
    
        cellElement.innerHTML = `<span class="loading-text">Fetching explanation from AI...</span>`;
    
        const prompt = `Provide additional information about the following alarm to operators.\nAlarm: "${description}\nProvide response in the following format:\nDetailed Description: (Detailed Description of the alarm)\nRisks: (Risks assiciated with the alarm)\nOperators Actions: (Suggested Operators Actions)\n\nResponse should be in plain text, but sections titles (Detailed Description, Risks and Operators Actions) should be bold."`;
    
        try {
            const response = await fetch(OPENAI_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini", // Or gpt-4o-mini etc.
                    messages: [
                        { role: "system", content: "You are expert in Tennessee Eastman Process (TEP). You goal is to provide additional information about the following alarm to operators.\nAlarms that have HIGH HIGH or LOW LOW conditions are considered as process trips (or emergency shut downs)." },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.4,
                    max_tokens: 350 // Slightly increased tokens for potential formatting
                })
            });
    
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error("OpenAI API Error Response:", errorData);
                const errorMessage = errorData.error?.message || `HTTP Error ${response.status}`;
                throw new Error(`API Error: ${errorMessage}`);
            }
    
            const data = await response.json();
    
            if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
                const markdownContent = data.choices[0].message.content.trim();
    
                // --- Use marked to parse Markdown to HTML ---
                // !! SECURITY WARNING: In a production environment, ALWAYS sanitize HTML
                // !! generated from external sources (even AI) before inserting into the DOM.
                // !! Use a library like DOMPurify: htmlOutput = DOMPurify.sanitize(marked.parse(markdownContent));
                const htmlOutput = marked.parse(markdownContent);
                // ---------------------------------------------
    
                cellElement.innerHTML = htmlOutput; // Display the PARSED HTML
    
            } else {
                console.warn("OpenAI Response format unexpected:", data);
                throw new Error("Received an unexpected response format from AI.");
            }
    
        } catch (error) {
            console.error("Error fetching OpenAI explanation:", error);
            cellElement.innerHTML = `<span class="error-text">Error fetching explanation: ${error.message}. Check console (F12).</span>`;
        }
    }


    // --- Handle Table Click Logic ---
    function handleTableClick(event) {
        const clickedRow = event.target.closest('tbody tr');

        if (!clickedRow || clickedRow.classList.contains('details-row')) {
            return; // Ignore clicks not on data rows or on the details row itself
        }

        const rowIndexAttr = clickedRow.dataset.rowIndex;
        if (rowIndexAttr === undefined || rowIndexAttr === null) {
            return; // Not a data row with an index
        }
        const rowIndex = parseInt(rowIndexAttr, 10);

        const isCurrentlyActive = clickedRow === activeDataRowElement;

        // --- Collapse previously expanded row (if any) ---
        if (expandedRowElement) {
            expandedRowElement.remove();
            expandedRowElement = null;
        }
        if (activeDataRowElement) {
            activeDataRowElement.classList.remove('active-row');
            activeDataRowElement = null;
        }

        // --- If clicking the already active row, just collapse it (handled above) ---
        if (isCurrentlyActive) {
            return;
        }

        // --- Expand new row ---
        activeDataRowElement = clickedRow;
        activeDataRowElement.classList.add('active-row'); // Highlight clicked row

        const rowData = currentlyDisplayedData[rowIndex]; // Get data using index from the *currently displayed* array
        const descriptionHeader = originalHeaders.find(h => h.toLowerCase() === 'description');

        if (!rowData || !descriptionHeader || !rowData[descriptionHeader]) {
            console.error("Could not find description data for row index:", rowIndex);
            // Create a details row with an error message
            const errorDetailsRow = document.createElement('tr');
            errorDetailsRow.classList.add('details-row');
            const errorCell = document.createElement('td');
            const validHeadersCount = originalHeaders.filter(h => h !== null && h !== undefined && String(h).trim() !== "").length;
            errorCell.colSpan = validHeadersCount;
            errorCell.innerHTML = `<span class="error-text">Could not retrieve details for this row.</span>`;
            errorDetailsRow.appendChild(errorCell);
            clickedRow.parentNode.insertBefore(errorDetailsRow, clickedRow.nextSibling);
            expandedRowElement = errorDetailsRow; // Store reference even for error row
            return;
        }

        const descriptionText = rowData[descriptionHeader];

        // Create the new details row elements
        const detailsRow = document.createElement('tr');
        detailsRow.classList.add('details-row');
        const detailsCell = document.createElement('td');
        const validHeadersCount = originalHeaders.filter(h => h !== null && h !== undefined && String(h).trim() !== "").length;
        detailsCell.colSpan = validHeadersCount;
        detailsCell.innerHTML = `<span class="loading-text">Loading details...</span>`; // Initial content
        detailsRow.appendChild(detailsCell);

        // Insert the details row right after the clicked row
        clickedRow.parentNode.insertBefore(detailsRow, clickedRow.nextSibling);
        expandedRowElement = detailsRow; // Store reference

        // Fetch explanation from OpenAI
        getOpenAIExplanation(descriptionText, detailsCell);
    }


    // --- Sorting Logic ---
    function sortData(dataToSort, columnKey, direction) {
        if (direction === 'none' || !columnKey) {
            return dataToSort; // Return original if no sort needed
        }

        // Create a copy to avoid modifying the source array directly if it's used elsewhere
        const sortedData = [...dataToSort].sort((a, b) => {
            let valA = a[columnKey];
            let valB = b[columnKey];

            // Consistent null/undefined handling (push to bottom on ascending)
            if (valA == null && valB == null) return 0;
            if (valA == null) return 1; // a is null/undefined, comes after b
            if (valB == null) return -1; // b is null/undefined, comes after a

            let comparison = 0;

            // Type-specific comparison
            if (valA instanceof Date && valB instanceof Date) {
                comparison = valA.getTime() - valB.getTime();
            } else if (typeof valA === 'number' && typeof valB === 'number') {
                 comparison = valA - valB; // Direct number comparison
            } else {
                // Fallback to string comparison for robustness
                valA = String(valA);
                valB = String(valB);
                // localeCompare is generally good for strings, including numbers within strings
                comparison = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
            }

            // Apply direction multiplier
            return direction === 'asc' ? comparison : (comparison * -1);
        });

        return sortedData;
    }


    // --- Core Logic: File Loading ---
    function handleFileSelect(event) {
        tableContainer.innerHTML = '<p class="initial-message">Loading data...</p>'; // Indicate loading
        // Reset state completely
        originalAlarmData = [];
        originalHeaders = [];
        currentlyDisplayedData = [];
        currentSortColumn = null;
        currentSortDirection = 'none';
        if (expandedRowElement) {
            expandedRowElement.remove();
            expandedRowElement = null;
        }
        if (activeDataRowElement) {
             activeDataRowElement.classList.remove('active-row');
             activeDataRowElement = null;
        }
        resetFilters(); // Clear filter fields

        const file = event.target.files[0];
        if (!file) {
            tableContainer.innerHTML = '<p class="initial-message">No file selected. Click "Source" again.</p>';
            return;
        }

        Papa.parse(file, {
            header: true,
            delimiter: ",", // Assuming comma delimiter based on previous issues
            skipEmptyLines: true,
            transformHeader: header => header.trim(), // Trim header whitespace
            dynamicTyping: false, // Process types manually after parsing
            complete: function(results) {
                console.log("CSV Parsing complete.");

                if (results.errors.length > 0 || !results.data || !results.meta.fields || results.meta.fields.length <= 1) {
                    console.error("Errors during parsing or invalid CSV structure:", results.errors);
                    tableContainer.innerHTML = `<p class="initial-message" style="color: red;">Error parsing CSV file. Ensure it's comma-separated with headers. Check console (F12) for details.</p>`;
                    csvFileInput.value = ''; // Clear file input
                    return;
                }

                originalHeaders = results.meta.fields; // Store headers

                // Process data: Convert timestamps and potentially other types
                originalAlarmData = results.data.map(row => {
                    // Find header keys robustly (case-insensitive, trimmed)
                    const timestampHeader = originalHeaders.find(h => h.toLowerCase() === 'timestamp');
                    // Add similar finds for other columns needing type conversion (e.g., numbers)

                    if (timestampHeader && row[timestampHeader]) {
                        row[timestampHeader] = parseTimestamp(row[timestampHeader]);
                    } else if (timestampHeader) {
                        row[timestampHeader] = null; // Ensure property exists even if null
                    }

                    // Example: Convert a 'value' column to number if it exists
                    // const valueHeader = originalHeaders.find(h => h.toLowerCase() === 'value');
                    // if (valueHeader && row[valueHeader]) {
                    //     const num = parseFloat(row[valueHeader]);
                    //     row[valueHeader] = isNaN(num) ? null : num; // Store number or null
                    // }

                    return row;
                });

                console.log(`Loaded ${originalAlarmData.length} alarms.`);
                currentlyDisplayedData = [...originalAlarmData]; // Initial display shows all data
                displayDataAsTable(currentlyDisplayedData, originalHeaders); // Display the full dataset
                csvFileInput.value = ''; // Clear file input for re-selection
            },
            error: function(error) {
                console.error("PapaParse File Read Error:", error);
                tableContainer.innerHTML = '<p class="initial-message" style="color: red;">Could not read the selected file.</p>';
                csvFileInput.value = '';
            }
        });
    }


    // --- Core Logic: Filtering ---
    function getFilteredData() {
         if (originalAlarmData.length === 0) {
            return []; // Return empty array if no base data
        }
        // Get filter values
        const startFilter = startDateInput.value ? new Date(startDateInput.value) : null;
        const endFilter = endDateInput.value ? new Date(endDateInput.value) : null;
        const tagFilter = tagFilterInput.value.trim().toLowerCase();
        const typeFilter = typeFilterInput.value.trim().toLowerCase();
        const descFilter = descFilterInput.value.trim().toLowerCase();

        // If using date-only inputs, adjust endFilter to end of day:
        // if (endFilter && endDateInput.type === 'date') { endFilter.setHours(23, 59, 59, 999); }

        const filteredData = originalAlarmData.filter(row => {
            let match = true; // Start assuming match

            // Robustly find header keys
            const timestampHeader = originalHeaders.find(h => h.toLowerCase() === 'timestamp');
            const tagHeader = originalHeaders.find(h => h.toLowerCase() === 'tag');
            const typeHeader = originalHeaders.find(h => h.toLowerCase() === 'type');
            const descriptionHeader = originalHeaders.find(h => h.toLowerCase() === 'description');

            // Get row values safely, converting to lower case for text comparison
            const rowTimestamp = timestampHeader ? row[timestampHeader] : null; // Already a Date object or null
            const rowTag = tagHeader && row[tagHeader] ? String(row[tagHeader]).toLowerCase() : '';
            const rowType = typeHeader && row[typeHeader] ? String(row[typeHeader]).toLowerCase() : '';
            const rowDesc = descriptionHeader && row[descriptionHeader] ? String(row[descriptionHeader]).toLowerCase() : '';

            // Apply filters
            // Check timestamp validity before comparing
            if (match && startFilter && (!rowTimestamp || !(rowTimestamp instanceof Date) || rowTimestamp < startFilter)) {
                match = false;
            }
            if (match && endFilter && (!rowTimestamp || !(rowTimestamp instanceof Date) || rowTimestamp > endFilter)) {
                match = false;
            }
            // Use includes for partial text matching
            if (match && tagFilter && !rowTag.includes(tagFilter)) {
                match = false;
            }
            if (match && typeFilter && !rowType.includes(typeFilter)) {
                match = false;
            }
            if (match && descFilter && !rowDesc.includes(descFilter)) {
                match = false;
            }

            return match;
        });
        return filteredData;
    }


    // --- Core Logic: Orchestrator for Search/Enter/Sort Click ---
    function filterAndDisplayData() {
        const filteredData = getFilteredData(); // Apply text/date filters
        const sortedData = sortData(filteredData, currentSortColumn, currentSortDirection); // Apply current sort order

        // --- Collapse any expanded row before re-rendering table content ---
         if (expandedRowElement) {
            expandedRowElement.remove();
            expandedRowElement = null;
        }
        if (activeDataRowElement) {
             activeDataRowElement.classList.remove('active-row');
             activeDataRowElement = null;
        }
        // --------------------------------------------------------------

        currentlyDisplayedData = sortedData; // Update the cache of what's displayed

        console.log(`Filter/Sort complete. Displaying ${currentlyDisplayedData.length} alarms.`);
        displayDataAsTable(currentlyDisplayedData, originalHeaders); // Display the final result
    }


    // --- Core Logic: Reset ---
     function resetFilters() {
         startDateInput.value = '';
         endDateInput.value = '';
         tagFilterInput.value = '';
         typeFilterInput.value = '';
         descFilterInput.value = '';
    }

    function resetFiltersAndDisplayAll() {
        resetFilters();
        // --- Collapse expanded row on reset ---
        if (expandedRowElement) {
            expandedRowElement.remove();
            expandedRowElement = null;
        }
        if (activeDataRowElement) {
             activeDataRowElement.classList.remove('active-row');
             activeDataRowElement = null;
        }
        // ------------------------------------
        currentSortColumn = null; // Reset sort state
        currentSortDirection = 'none';
        currentlyDisplayedData = [...originalAlarmData]; // Reset display cache to full dataset
        displayDataAsTable(currentlyDisplayedData, originalHeaders); // Display original, unsorted data
    }


    // --- Core Logic: Table Display Function ---
    function displayDataAsTable(data, headers) {
        // Clear only the *content* of the container, leave the container itself for the event listener
        tableContainer.innerHTML = '';

        if (!headers || headers.length === 0) {
            tableContainer.innerHTML = '<p class="initial-message">Load data using the "Source" button.</p>';
            return; // Cannot proceed without headers
        }

        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const tbody = document.createElement('tbody'); // Create tbody here
        const headerRow = document.createElement('tr');

        // --- Create Table Headers ---
        // Filter out potential blank headers from CSV parsing
        const validHeaders = headers.filter(h => h !== null && h !== undefined && String(h).trim() !== "");
        // Robustly find key header names needed later
        const timestampHeaderName = headers.find(h => h.toLowerCase() === 'timestamp');
        const typeHeaderName = headers.find(h => h.toLowerCase().trim() === 'type');
        const descriptionHeaderName = headers.find(h => h.toLowerCase().trim() === 'description');


        validHeaders.forEach(headerText => {
            const th = document.createElement('th');
            const columnKey = headerText; // The key used in data objects is the header text itself

            // Display text for the header
            if (headerText === "" && headers.indexOf(headerText) === 0) {
                th.textContent = "Index"; // Handle potential index column
                // Make index column non-sortable if desired
                // th.classList.add('non-sortable');
            } else {
                th.textContent = headerText;
                th.classList.add('sortable-header'); // Mark as sortable
                th.dataset.columnKey = columnKey; // Store the key for sorting

                // Apply current sort indicator styling
                if (columnKey === currentSortColumn) {
                    th.classList.add(currentSortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
                }
            }

             // Add class for description column specific styling (e.g., text wrapping)
             if (headerText.toLowerCase() === 'description') {
                 th.classList.add('description-col');
             }

            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);

        // --- Add Header Click Listener (attach ONCE to thead) ---
        // Moved outside the main display logic, but functionally placed here for clarity
        thead.addEventListener('click', (event) => {
            const targetHeader = event.target.closest('th.sortable-header'); // Find the clicked sortable header
            if (!targetHeader) return; // Exit if click wasn't on a sortable header

            const columnKey = targetHeader.dataset.columnKey;
            if (!columnKey) return; // Exit if key not found

            // Determine next sort direction
            let nextDirection = 'asc'; // Default to ascending for new column
            if (currentSortColumn === columnKey) {
                // Toggle if clicking the same column
                nextDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
            }

            // Update global sort state
            currentSortColumn = columnKey;
            currentSortDirection = nextDirection;

            // Re-filter and re-sort the data, then display
            filterAndDisplayData();
        });


         // --- Populate Table Body ---
         if (data && data.length > 0) {
            data.forEach((rowData, index) => { // Get index for data-row-index attribute
                const row = document.createElement('tr'); // Create the <tr> element
                row.dataset.rowIndex = index; // Store the index relative to the *currently displayed data* array

                // Check for critical alarm type for highlighting
                let isCritical = false;
                if (typeHeaderName && rowData[typeHeaderName]) { // Check if type header/value exists
                    const typeValue = String(rowData[typeHeaderName]).toUpperCase().trim();
                    if (typeValue === 'LL' || typeValue === 'HH') {
                        isCritical = true;
                    }
                }
                if (isCritical) {
                    row.classList.add('critical-alarm'); // Apply highlighting class
                }

                // --- Populate Cells (TD) ---
                validHeaders.forEach(header => {
                    const cell = document.createElement('td');
                    const originalHeader = header; // The key in rowData is the header text
                    let value = rowData[originalHeader];

                    // Format timestamp column specifically
                    if (originalHeader === timestampHeaderName && value instanceof Date) {
                        cell.textContent = formatDateForDisplay(value);
                    } else {
                        // Display other values as strings, handle null/undefined
                        cell.textContent = (value !== undefined && value !== null) ? String(value) : '';
                    }

                    // Add class for description column specific styling
                    if (header === descriptionHeaderName) {
                        cell.classList.add('description-col');
                    }
                    row.appendChild(cell); // Add cell to the row
                });
                tbody.appendChild(row); // Add the completed row to the tbody
            });
        } else {
             // Handle No Data Rows (display message within tbody)
             const messageRow = document.createElement('tr');
             messageRow.classList.add('no-data-message-row'); // Class for potential styling
             const messageCell = document.createElement('td');
             messageCell.colSpan = validHeaders.length; // Span across table width
             // Add the appropriate message based on whether data was initially loaded
             if (originalAlarmData.length > 0) {
                 messageCell.innerHTML = '<span class="no-results-message">No alarms match the current filter criteria.</span>';
             } else {
                 messageCell.innerHTML = '<span class="initial-message">Click "Source" to load alarm data.</span>';
             }
             messageRow.appendChild(messageCell);
             tbody.appendChild(messageRow); // Append the message row to the tbody
        }


        table.appendChild(thead);
        table.appendChild(tbody); // Append tbody containing rows or message
        tableContainer.appendChild(table); // Add the complete table to the DOM
    }

}); // End DOMContentLoaded