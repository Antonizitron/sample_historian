document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const csvTrendInput = document.getElementById('csvTrendInput');
    const sourceTrendButton = document.getElementById('sourceTrendButton');
    const loadingMessage = document.getElementById('loadingMessage');
    const tagSelectionControls = document.getElementById('tagSelectionControls');
    const tagInput = document.getElementById('tagInput');
    const tagOptionsDatalist = document.getElementById('tagOptionsDatalist');
    const addTagButton = document.getElementById('addTagButton');
    const plottedTagsList = document.getElementById('plottedTagsList');
    const tagUserMessage = document.getElementById('tagUserMessage');
    const trendStartDateInput = document.getElementById('trendStartDate');
    const trendEndDateInput = document.getElementById('trendEndDate');
    const chartContainer = document.getElementById('chartContainer');
    const chartDiv = document.getElementById('chartDiv');
    const tooltip = d3.select("#tooltip");

    // --- New DOM Elements for Alarms ---
    const csvAlarmsInput = document.getElementById('csvAlarmsInput');
    const sourceAlarmsButton = document.getElementById('sourceAlarmsButton');
    const alarmDisplay = document.getElementById('alarmDisplay');

    // --- Global State ---
    let timeSeriesData = null;
    let availableTags = [];
    let selectedTags = [];
    let filteredDataCache = {
      timestamps: [],
      tagData: {},
      indices: []
    };
    let currentZoomTransform = null;
    let persistentCursor = null;
    let persistentCursorTimestamp = null;

    // --- New Global State for Alarms ---
    let alarmsData = []; // Array of alarm objects { timestamp: Date, tag, type, description }

    // --- D3 Chart Setup Variables ---
    let svg, g, xScale, yScale, xAxisGen, lineGen, colorScale, width, height, margin, zoom;
    const baseMarginLeft = 40;
    margin = { top: 20, right: 30, bottom: 50, left: baseMarginLeft };

    const initChart = () => {
      console.log("Initializing D3 chart...");
      d3.select(chartDiv).select("svg").remove();
      const initialMsg = chartDiv.querySelector('.initial-chart-message');
      if (initialMsg) initialMsg.remove();

      const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          const newWidth = entry.contentRect.width;
          if (
            svg &&
            newWidth > 0 &&
            Math.abs(newWidth - (parseFloat(svg.attr("width")) || 0) + margin.left + margin.right) > 1
          ) {
            console.log("Chart container resized, re-rendering.");
            setupChartDimensions(newWidth);
            updateChart(true);
          }
        }
      });
      resizeObserver.observe(chartDiv);

      setupChartDimensions(chartDiv.clientWidth);

      xScale = d3.scaleTime().range([0, width]);
      yScale = d3.scaleLinear().domain([0, 100]).range([height, 0]);
      colorScale = d3.scaleOrdinal(d3.schemeCategory10);

      xAxisGen = d3.axisBottom(xScale)
        .ticks(Math.max(3, Math.floor(width / 100)))
        .tickSizeOuter(0);

      lineGen = d3.line()
        .defined(d => d.valuePercent !== null && !isNaN(d.valuePercent))
        .x(d => xScale(d.timestamp))
        .y(d => yScale(d.valuePercent));

      svg = d3.select(chartDiv).append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .style("background-color", "var(--gcp-background-card)");

      svg.append("defs").append("clipPath")
        .attr("id", "clip")
        .append("rect")
        .attr("width", width)
        .attr("height", height);

      g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${height})`)
        .call(xAxisGen);

      g.append("g").attr("class", "y-axes-container");

      g.append("g")
        .attr("class", "lines-group")
        .attr("clip-path", "url(#clip)");

      zoom = d3.zoom()
        .scaleExtent([0.5, 20])
        .translateExtent([[0, 0], [width, height]])
        .extent([[0, 0], [width, height]])
        .on("zoom", zoomed);

      g.append("rect")
        .attr("class", "zoom-overlay")
        .attr("width", width)
        .attr("height", height)
        .style("fill", "none")
        .style("pointer-events", "all")
        .call(zoom)
        .on("mouseover.tooltip", () => tooltip.style("opacity", 1))
        .on("mouseout.tooltip", () => tooltip.style("opacity", 0))
        .on("mousemove.tooltip", mousemove)
        .on("click", function(event) {
          if (event.button !== 0) return;
          if (persistentCursor) {
              persistentCursor.remove();
              persistentCursor = null;
              persistentCursorTimestamp = null;
              tooltip.style("opacity", 0);
              updateAlarmsDisplay(); // Clear alarms when cursor is removed
          } else {
              const [xm, ym] = d3.pointer(event, g.node());
              if (xm < 0 || xm > width || !filteredDataCache || !filteredDataCache.timestamps || filteredDataCache.timestamps.length === 0) return; // Added check for valid data
              const xScaleCurrent = currentZoomTransform ? currentZoomTransform.rescaleX(xScale) : xScale; // Use current zoom or base scale
              const clickedDate = xScaleCurrent.invert(xm);
              const bisectDate = d3.bisector(d => d).left;
              const index = bisectDate(filteredDataCache.timestamps, clickedDate, 1);
              const d0 = filteredDataCache.timestamps[index - 1];
              const d1 = filteredDataCache.timestamps[index];
              let closestIndex;
              if (d0 && d1) {
                closestIndex = (clickedDate - d0 > d1 - clickedDate) ? index : index - 1;
              } else if (d0) {
                closestIndex = index - 1;
              } else if (d1) {
                closestIndex = index;
              } else {
                return; // No valid points to snap to
              }

              if (closestIndex < 0 || closestIndex >= filteredDataCache.timestamps.length) return;
              persistentCursorTimestamp = filteredDataCache.timestamps[closestIndex];
              const xPos = xScaleCurrent(persistentCursorTimestamp);

              if (xPos >= 0 && xPos <= width) { // Ensure cursor is within bounds before drawing
                persistentCursor = g.append("line")
                    .attr("class", "persistent-cursor")
                    .attr("x1", xPos)
                    .attr("x2", xPos)
                    .attr("y1", 0)
                    .attr("y2", height)
                    .attr("stroke", "black")
                    .attr("stroke-dasharray", "3,3");
                updateCursorTooltip(xPos, event);
                updateAlarmsDisplay(); // Show alarms for the clicked timestamp
              } else {
                  persistentCursorTimestamp = null; // Don't set if out of bounds
              }
          }
        });

      currentZoomTransform = d3.zoomIdentity;
      console.log("D3 chart initialized.");
    };

    const setupChartDimensions = (containerWidth) => {
      width = Math.max(100, containerWidth - margin.left - margin.right);
      let containerHeight = chartDiv.clientHeight || 400;
      height = Math.max(150, containerHeight - margin.top - margin.bottom);

      if (svg) {
        svg.attr("width", width + margin.left + margin.right)
          .attr("height", height + margin.top + margin.bottom)
          .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);
        svg.select("#clip rect").attr("width", width).attr("height", height);
        g.select(".zoom-overlay").attr("width", width).attr("height", height);
        xScale.range([0, width]);
        yScale.range([height, 0]);
        g.select(".x-axis").attr("transform", `translate(0,${height})`);
        if (zoom) {
          zoom.translateExtent([[0, 0], [width, height]])
            .extent([[0, 0], [width, height]]);
        }
      }
    };

    function updateCursorTooltip(pointerX, clickEvent) {
      if (!currentZoomTransform || !filteredDataCache || !filteredDataCache.timestamps || filteredDataCache.timestamps.length === 0) return;

      const xScaleCurrent = currentZoomTransform.rescaleX(xScale);
      const hoveredDate = xScaleCurrent.invert(pointerX);
      const bisectDate = d3.bisector(d => d).left;
      const index = bisectDate(filteredDataCache.timestamps, hoveredDate, 1);
      const d0 = filteredDataCache.timestamps[index - 1];
      const d1 = filteredDataCache.timestamps[index];
      let closestIndex;
      if (d0 && d1) {
        closestIndex = (hoveredDate - d0 > d1 - hoveredDate) ? index : index - 1;
      } else if (d0) {
         closestIndex = index - 1;
      } else if (d1) {
         closestIndex = index;
      } else {
        tooltip.style("opacity", 0);
        return; // No points to evaluate against
      }

      if (closestIndex < 0 || closestIndex >= filteredDataCache.timestamps.length) {
        tooltip.style("opacity", 0);
        return;
      }
      const closestTimestamp = filteredDataCache.timestamps[closestIndex];

      let tooltipHtml = `<div class="tooltip-date">${d3.timeFormat("%Y-%m-%d %H:%M:%S")(closestTimestamp)}</div>`;
      tooltipHtml += "<table>";
      if (colorScale) colorScale.domain(selectedTags);
      if (selectedTags.length === 0) {
        tooltipHtml += `<tr><td colspan="2">No tags selected</td></tr>`;
      } else {
        selectedTags.forEach(tag => {
          let tagCache = filteredDataCache.tagData[tag];
          let originalValue = "N/A";
          // Check if tagCache and its properties exist before accessing
          if (tagCache && tagCache.originalValues && closestIndex < tagCache.originalValues.length) {
            const val = tagCache.originalValues[closestIndex];
            if (val != null && !isNaN(val)) { // More robust check for null/undefined/NaN
                originalValue = val.toFixed(2);
            }
          }
          tooltipHtml += `<tr>
                  <td><span style="color:${colorScale ? colorScale(tag) : '#ccc'}; font-weight:bold; margin-right: 4px;">■ ${tag}:</span></td>
                  <td style="text-align: right; padding-left: 8px;color:${colorScale ? colorScale(tag) : '#ccc'};">${originalValue}</td>
              </tr>`;
        });
      }
      tooltipHtml += "</table>";
      tooltip.html(tooltipHtml);

      const offset = 10;
      tooltip.style("position", "fixed")
             .style("left", (clickEvent.clientX + offset) + "px")
             .style("top", (clickEvent.clientY + offset) + "px")
             .style("opacity", 0.9);
    }

    // --- Event Listeners ---
    sourceTrendButton.addEventListener('click', () => csvTrendInput.click());
    csvTrendInput.addEventListener('change', handleFileSelect);
    addTagButton.addEventListener('click', handleAddTag);
    tagInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); handleAddTag(); }
    });
    plottedTagsList.addEventListener('click', handleRemoveTag);
    trendStartDateInput.addEventListener('change', () => updateChart(true));
    trendEndDateInput.addEventListener('change', () => updateChart(true));

    // --- New Event Listeners for Alarms ---
    sourceAlarmsButton.addEventListener('click', () => csvAlarmsInput.click());
    csvAlarmsInput.addEventListener('change', handleAlarmsFileSelect);

    function showLoading(message) {
      loadingMessage.textContent = message;
      sourceTrendButton.disabled = true;
    }
    function hideLoading() {
      loadingMessage.textContent = '';
      sourceTrendButton.disabled = false;
    }
    function showChartMessage(message, isError = false) {
      if (svg) { svg.remove(); svg = null; }
      chartDiv.innerHTML = `<p class="initial-chart-message ${isError ? 'error-message' : ''}">${message}</p>`;
      if (isError) console.error("Chart Message:", message);
      currentZoomTransform = null;
    }
    function parseTimestamp(tsString) {
      if (!tsString || typeof tsString !== 'string') return null;
      // Try common formats, including space or 'T' separator
      const isoLikeString = tsString.includes('T') ? tsString : tsString.replace(' ', 'T');
      // Handle potential fractional seconds more robustly
      let date = new Date(isoLikeString);
      // If initial parse fails, try just date/time part if fractional seconds are weird
      if (isNaN(date.getTime()) && isoLikeString.includes('.')) {
          date = new Date(isoLikeString.split('.')[0]);
      }
      // Final check
      if (!isNaN(date.getTime())) return date;

      console.warn(`Could not parse timestamp: "${tsString}"`);
      return null;
    }
    function getLineDataForTag(tag) {
      if (!filteredDataCache || !filteredDataCache.tagData[tag] || !filteredDataCache.timestamps) return []; // Added timestamp check
      return filteredDataCache.timestamps.map((ts, i) => ({
        timestamp: ts,
        valuePercent: filteredDataCache.tagData[tag].values?.[i], // Use optional chaining
        originalValue: filteredDataCache.tagData[tag].originalValues?.[i] // Use optional chaining
      }));
    }

    // --- File Loading: Trends CSV ---
    function handleFileSelect(event) {
      const file = event.target.files[0];
      if (!file) return;
      showLoading('Loading and parsing CSV...');
      timeSeriesData = null; availableTags = []; selectedTags = [];
      tagOptionsDatalist.innerHTML = ''; tagInput.value = '';
      trendStartDateInput.value = ''; trendEndDateInput.value = '';
      tagSelectionControls.style.display = 'none';
      renderPlottedTagsList();
      showChartMessage('Loading data...');
      currentZoomTransform = null;
      if (persistentCursor) { // Clear cursor on new data load
          persistentCursor.remove();
          persistentCursor = null;
          persistentCursorTimestamp = null;
          updateAlarmsDisplay(); // Hide alarms
      }

      Papa.parse(file, {
        skipEmptyLines: true,
        // dynamicTyping: true, // Turn off dynamic typing, parse numbers manually
        complete: function(results) {
          hideLoading();
          if (results.errors.length > 0 || !results.data || results.data.length < 2 ||
              !results.data[0] || results.data[0].length < 2) {
            let errorMsg = "Error parsing CSV.";
            if (results.errors.length > 0)
              errorMsg = `Error parsing CSV: ${results.errors[0].message}.`;
            else if (!results.data || results.data.length < 2)
              errorMsg = "CSV requires header + data rows.";
            else if (!results.data[0] || results.data[0].length < 2)
              errorMsg = "Invalid header row (needs Timestamp + Tags).";
            showChartMessage(errorMsg + " Check console.", true);
            csvTrendInput.value = '';
            return;
          }
          let headers = [];
          try { headers = results.data[0].map(h => h ? h.trim() : ''); }
          catch (e) { showChartMessage("Error processing CSV header row.", true); csvTrendInput.value = ''; return; }
          const timestampHeader = headers[0]; // Assume first col is timestamp
          availableTags = headers.slice(1).filter(h => h !== '');
          if (availableTags.length === 0) {
            showChartMessage("No tag columns found after timestamp.", true);
            csvTrendInput.value = '';
            return;
          }

          const data = { timestamps: [], tags: {} };
          availableTags.forEach(tag => data.tags[tag] = []);
          const dataRows = results.data.slice(1);
          let parseErrors = 0; let validRowsProcessed = 0;
          dataRows.forEach((row) => {
            if (!row || row.length === 0 || !row[0]) { parseErrors++; return; } // Check if row or timestamp exists
            const timestamp = parseTimestamp(row[0]); // Use our parser
            if (timestamp === null) { parseErrors++; return; }

            // Ensure row has enough columns for all expected tags
            if (row.length < headers.length) {
                 // Pad missing tag values with null for this row
                 for (let i = row.length; i < headers.length; i++) {
                     row.push(null);
                 }
             }

            data.timestamps.push(timestamp);
            availableTags.forEach((tag, tagIndex) => {
              const valueStr = row[tagIndex + 1];
              const value = (valueStr !== null && valueStr !== undefined && String(valueStr).trim() !== '') ? parseFloat(valueStr) : null; // Handle null/empty strings explicitly
              data.tags[tag].push((!isNaN(value) && value !== null) ? value : null); // Store null if not a valid number
            });
            validRowsProcessed++;
          });
          if (validRowsProcessed === 0) {
            showChartMessage("No valid data rows processed.", true);
            csvTrendInput.value = '';
            return;
          }
          if (parseErrors > 0) console.warn(`Skipped ${parseErrors} rows due to parsing issues.`);

          timeSeriesData = data;
          populateDatalist();
          tagSelectionControls.style.display = 'block';
          initChart();
          showChartMessage('Find and add tags using the controls above.');
          csvTrendInput.value = ''; // Clear file input
        },
        error: function(error, file) {
          showChartMessage(`Error reading file: ${error.message}.`, true);
          hideLoading();
          csvTrendInput.value = '';
          currentZoomTransform = null;
        }
      });
    }

    // --- File Loading: Alarms CSV ---
    function handleAlarmsFileSelect(event) {
      const file = event.target.files[0];
      if (!file) return;
      Papa.parse(file, {
         header: true,
         skipEmptyLines: true,
         // dynamicTyping: true, // Keep this? Or parse manually too? Let's parse TS manually.
         complete: function(results) {
             if (results.errors.length > 0 || !results.data || results.data.length === 0) {
                 console.error("Error parsing alarms CSV.", results.errors);
                 alarmsData = []; // Clear existing alarm data on error
                 updateAlarmsDisplay(); // Update display (will likely hide it)
                 return;
             }
             // Find header keys robustly (case-insensitive, trimmed)
             const headers = results.meta.fields.map(h => h.toLowerCase().trim());
             const tsIndex = headers.indexOf('timestamp');
             const tagIndex = headers.indexOf('tag');
             const typeIndex = headers.indexOf('type');
             const descIndex = headers.indexOf('description');

             if (tsIndex === -1) {
                 console.error("Alarms CSV missing 'timestamp' column.");
                 alarmsData = [];
                 updateAlarmsDisplay();
                 return;
             }

             alarmsData = results.data
               .map(row => {
                 const ts = row[results.meta.fields[tsIndex]]; // Get original value using original header name
                 return {
                     timestamp: parseTimestamp(ts), // Use our robust parser
                     tag: tagIndex !== -1 ? row[results.meta.fields[tagIndex]] || "" : "", // Handle missing column
                     type: typeIndex !== -1 ? row[results.meta.fields[typeIndex]] || "" : "", // Handle missing column
                     description: descIndex !== -1 ? row[results.meta.fields[descIndex]] || "" : "" // Handle missing column
                 };
               })
               .filter(a => a.timestamp !== null); // Filter out rows where timestamp couldn't be parsed

             console.log(`Loaded ${alarmsData.length} alarms.`);
             updateAlarmsDisplay(); // Update display in case cursor is already set
             csvAlarmsInput.value = ''; // Clear file input
         },
         error: function(error) {
             console.error("Error reading alarms CSV:", error);
             alarmsData = [];
             updateAlarmsDisplay();
             csvAlarmsInput.value = '';
         }
      });
    }

    function populateDatalist() {
      tagOptionsDatalist.innerHTML = '';
      if (!availableTags || availableTags.length === 0) return;
      availableTags.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        tagOptionsDatalist.appendChild(option);
      });
    }

    function renderPlottedTagsList() {
      plottedTagsList.innerHTML = '';
      if (selectedTags.length === 0) {
        plottedTagsList.innerHTML = '<li class="no-tags-message">No tags added yet.</li>';
        return;
      }
      if (colorScale) colorScale.domain(selectedTags);
      selectedTags.forEach(tag => {
        const listItem = document.createElement('li');
        listItem.className = 'plotted-tag-item';
        const colorSwatch = document.createElement('span');
        Object.assign(colorSwatch.style, {
          display: 'inline-block',
          width: '12px',
          height: '12px',
          backgroundColor: colorScale ? colorScale(tag) : '#ccc',
          marginRight: '8px',
          verticalAlign: 'middle',
          borderRadius: '2px'
        });
        const tagNameSpan = document.createElement('span');
        tagNameSpan.className = 'tag-name';
        tagNameSpan.textContent = tag;
        tagNameSpan.style.verticalAlign = 'middle';
        const removeButton = document.createElement('button');
        removeButton.className = 'button button-icon button-remove remove-tag-btn';
        removeButton.textContent = '-'; // Use '-' for remove icon
        removeButton.title = `Remove ${tag}`;
        removeButton.dataset.tag = tag;
        listItem.append(colorSwatch, tagNameSpan, removeButton);
        plottedTagsList.appendChild(listItem);
      });
    }

    function handleAddTag() {
      tagUserMessage.textContent = '';
      const tagToAdd = tagInput.value.trim();
      if (!tagToAdd) {
        tagUserMessage.textContent = 'Please enter or select a tag.';
        return;
      }
      if (!timeSeriesData) {
        tagUserMessage.textContent = 'Load data first.';
        return;
      }
      if (!availableTags || !availableTags.includes(tagToAdd)) {
        tagUserMessage.textContent = `Tag "${tagToAdd}" not found.`;
        return;
      }
      if (selectedTags.includes(tagToAdd)) {
        tagUserMessage.textContent = `Tag "${tagToAdd}" already plotted.`;
        tagInput.value = '';
        return;
      }
      selectedTags.push(tagToAdd);
      renderPlottedTagsList();
      updateChart(false);
      tagInput.value = '';
      tagInput.focus();
    }
    function handleRemoveTag(event) {
      if (!event.target.classList.contains('remove-tag-btn')) return;
      const tagToRemove = event.target.dataset.tag;
      if (!tagToRemove) return;
      selectedTags = selectedTags.filter(tag => tag !== tagToRemove);
      renderPlottedTagsList();
      updateChart(false); // Don't reset zoom when removing a tag
    }

    function updateChart(keepZoom = false) {
      console.log(`updateChart called. KeepZoom: ${keepZoom}`);
      if (!timeSeriesData) {
        showChartMessage('Load data first.');
        return;
      }
      if (!svg) initChart();
      if (!svg) {
        console.error("SVG init failed.");
        return;
      }

      const axisSpacing = 40;
      margin.left = baseMarginLeft + (selectedTags.length * axisSpacing);
      // Re-calculate width based on potentially new margin
      setupChartDimensions(chartDiv.clientWidth); // Recalculates width/height and applies basic attrs

      // Update group transform based on potentially new margin.left
      g.attr("transform", `translate(${margin.left},${margin.top})`);

      if (selectedTags.length === 0) {
        g.select(".lines-group").selectAll(".line").remove();
        showChartMessage('Find and add tags using the controls above.');
        filteredDataCache = { timestamps: [], tagData: {}, indices: [] };
        if (zoom && !keepZoom) { // Only reset zoom if not explicitly keeping it
          g.select(".zoom-overlay").call(zoom.transform, d3.zoomIdentity);
          currentZoomTransform = d3.zoomIdentity;
        }
        g.select(".y-axes-container").selectAll(".y-axis-tag").remove();
         if (persistentCursor) { // Also remove cursor if no tags are plotted
             persistentCursor.remove();
             persistentCursor = null;
             persistentCursorTimestamp = null;
             updateAlarmsDisplay();
         }
        return;
      } else {
        const initialMsg = chartDiv.querySelector('.initial-chart-message');
        if (initialMsg) initialMsg.remove();
      }

      // Apply Date Filters
      const startDateFilter = trendStartDateInput.value ? new Date(trendStartDateInput.value) : null;
      const endDateFilter = trendEndDateInput.value ? new Date(trendEndDateInput.value) : null;
      const indices = [];
      const filteredTimestamps = [];
      timeSeriesData.timestamps.forEach((ts, i) => {
        if (!ts) return;
        let match = true;
        if (startDateFilter && ts < startDateFilter) match = false;
        if (endDateFilter && ts > endDateFilter) match = false;
        if (match) {
          indices.push(i);
          filteredTimestamps.push(ts);
        }
      });
      if (filteredTimestamps.length === 0) {
        showChartMessage('No data points match date range.');
        g.select(".lines-group").selectAll(".line").remove();
        filteredDataCache = { timestamps: [], tagData: {}, indices: [] };
        if (zoom && !keepZoom) { // Reset zoom if no data
          g.select(".zoom-overlay").call(zoom.transform, d3.zoomIdentity);
          currentZoomTransform = d3.zoomIdentity;
        }
        g.select(".y-axes-container").selectAll(".y-axis-tag").remove();
         if (persistentCursor) { // Remove cursor if no data
             persistentCursor.remove();
             persistentCursor = null;
             persistentCursorTimestamp = null;
             updateAlarmsDisplay();
         }
        return;
      }

      // Prepare data for selected tags within the filtered range
      const newTagDataCache = {};
      selectedTags.forEach(tag => {
        const originalValues = indices.map(i => timeSeriesData.tags[tag]?.[i]);
        const numericValues = originalValues.filter(v => v !== null && v !== undefined && !isNaN(v));
        let minVal = null, maxVal = null, range = 0;
        if (numericValues.length > 0) {
          minVal = Math.min(...numericValues);
          maxVal = Math.max(...numericValues);
          range = maxVal - minVal;
        }
        // Calculate percentage values
        const percentValues = originalValues.map(originalVal => {
          if (originalVal !== null && !isNaN(originalVal)) {
            if (range > 0) return ((originalVal - minVal) / range) * 100;
            if (minVal !== null) return 50; // If range is 0, plot at 50%
          }
          return null; // Keep nulls as null
        });
        newTagDataCache[tag] = { values: percentValues, originalValues: originalValues, min: minVal, max: maxVal };
      });
      filteredDataCache = {
        timestamps: filteredTimestamps,
        tagData: newTagDataCache,
        indices: indices // Store original indices if needed later
      };

      // Update X Axis Domain
      const timeExtent = d3.extent(filteredTimestamps);
      xScale.domain(timeExtent);

      // Apply Transitions
      const t = svg.transition().duration(keepZoom ? 50 : 500); // Use shorter transition if keeping zoom

      // Update X Axis Ticks
      g.select(".x-axis").transition(t)
          .attr("transform", `translate(0,${height})`) // Ensure position is correct after resize
          .call(xAxisGen.scale(xScale).ticks(Math.max(3, Math.floor(width / 100)))); // Rescale and adjust ticks

      // Update Lines
      const linesGroup = g.select(".lines-group");
      colorScale.domain(selectedTags); // Ensure color scale domain is up-to-date

      linesGroup.selectAll(".line")
        .data(selectedTags, d => d) // Use tag name as key
        .join(
          enter => enter.append("path")
            .attr("class", "line")
            .attr("fill", "none")
            .attr("stroke-width", 1.5)
            .attr("stroke", d => colorScale(d))
            .attr("d", tag => lineGen(getLineDataForTag(tag))) // Use base xScale initially
            .style("opacity", 0)
            .call(enter => enter.transition(t).style("opacity", 1)),
          update => update.call(update => update.transition(t)
            .attr("stroke", d => colorScale(d))
            // On update, recalculate 'd' using the *base* xScale, zoom will handle transform
            .attr("d", tag => lineGen(getLineDataForTag(tag)))
            .style("opacity", 1)),
          exit => exit.call(exit => exit.transition(t).style("opacity", 0).remove())
        );

      // Update Y Axes
      const yAxesContainer = g.select(".y-axes-container");
      yAxesContainer.selectAll(".y-axis-tag")
        .data(selectedTags, d => d)
        .join(
          enter => enter.append("g")
            .attr("class", "y-axis-tag")
            .style("opacity", 0) // Start transparent
            .attr("transform", (d, i) => `translate(${- (axisSpacing * (i + 1))},0)`)
            .each(function(tag) { createOrUpdateYAxis(this, tag); })
            .call(enter => enter.transition(t).style("opacity", 1)), // Fade in
          update => update
            .each(function(tag) { createOrUpdateYAxis(this, tag); }) // Update existing axis
            .transition(t) // Smoothly move axis if order changed
            .attr("transform", (d, i) => `translate(${- (axisSpacing * (i + 1))},0)`)
            .style("opacity", 1), // Ensure stays opaque
          exit => exit.transition(t).style("opacity", 0).remove() // Fade out and remove
        );

      // Apply or Reset Zoom
      const zoomOverlay = g.select(".zoom-overlay");
      if (!zoom) return; // Should not happen if initChart worked

      if (keepZoom && currentZoomTransform) {
        console.log("Applying stored zoom transform.");
        zoomOverlay.call(zoom.transform, currentZoomTransform); // Apply directly, no transition needed here usually
        zoomed({ transform: currentZoomTransform }); // Manually call zoomed to update visuals
      } else if (!keepZoom) {
        console.log("Resetting zoom state.");
        // Use transition on the overlay call to visually reset zoom
        zoomOverlay.transition(t).call(zoom.transform, d3.zoomIdentity);
        currentZoomTransform = d3.zoomIdentity;
        zoomed({ transform: d3.zoomIdentity }); // Update visuals after reset
      }

      // Update persistent cursor position if it exists
       if (persistentCursor && persistentCursorTimestamp) {
           const xScaleCurrent = currentZoomTransform ? currentZoomTransform.rescaleX(xScale) : xScale;
           const xPos = xScaleCurrent(persistentCursorTimestamp);
           if (xPos >= 0 && xPos <= width) { // Check if still within bounds
               persistentCursor.attr("x1", xPos).attr("x2", xPos).style("display", null);
           } else {
               persistentCursor.style("display", "none"); // Hide if out of bounds
           }
           updateAlarmsDisplay(); // Ensure alarms are up-to-date
       } else {
           updateAlarmsDisplay(); // Ensure alarms are hidden if no cursor
       }
    }

    // Helper for Y-axis creation/update
    function createOrUpdateYAxis(element, tag) {
      const tagData = filteredDataCache.tagData[tag];
      if (!tagData) return;

      const min = tagData.min ?? 0; // Default to 0 if null/undefined
      const max = tagData.max ?? min; // Default to min if max is missing
      const range = max - min;

      // Use the main chart height for the range
      const tagScale = d3.scaleLinear().domain([min, max]).range([height, 0]);
      const axisGen = d3.axisLeft(tagScale)
        .ticks(5) // Adjust number of ticks as needed
        .tickFormat(d3.format(".2f")); // Format to 2 decimal places

      // Apply axis generator to the group element
      d3.select(element).call(axisGen);

      // Style the axis elements
      d3.select(element).selectAll("text").style("fill", colorScale(tag));
      d3.select(element).selectAll("path, line").style("stroke", colorScale(tag));
    }


    function zoomed(event) {
      // Store the transform
      if (!event || !event.transform) {
        // If called without event (e.g., during updateChart), use the stored transform
        if (!currentZoomTransform) return; // No transform to apply
        event = { transform: currentZoomTransform };
      } else {
        // If called by D3 zoom event, update the stored transform
        currentZoomTransform = event.transform;
      }

      if (!xScale) return; // Exit if chart not ready

      // Create the new scaled X axis
      const xScaleNew = currentZoomTransform.rescaleX(xScale);

      // Update the X axis visual
      g.select(".x-axis").call(xAxisGen.scale(xScaleNew));

      // Update the lines based on the new scale
      const linesGroup = g.select(".lines-group");
      linesGroup.selectAll(".line").attr("d", tag => {
        const tempLineGen = d3.line()
          .defined(d => d.valuePercent !== null && !isNaN(d.valuePercent))
          .x(d => xScaleNew(d.timestamp)) // Use the NEW scale here
          .y(d => yScale(d.valuePercent)); // Y scale remains the same (percentage)
        const lineData = getLineDataForTag(tag);
        return tempLineGen(lineData);
      });

      // Update persistent cursor position if it exists
      if (persistentCursor && persistentCursorTimestamp) {
          const xPos = xScaleNew(persistentCursorTimestamp);
           if (xPos >= 0 && xPos <= width) { // Check if still within bounds
               persistentCursor.attr("x1", xPos).attr("x2", xPos).style("display", null);
           } else {
               persistentCursor.style("display", "none"); // Hide if out of bounds
           }
           updateAlarmsDisplay(); // Ensure alarms are up-to-date
      }
    }

    function mousemove(event) {
      if (!filteredDataCache || filteredDataCache.timestamps.length === 0 ||
          selectedTags.length === 0 || !currentZoomTransform || !xScale || !g || !svg) {
        tooltip.style("opacity", 0);
        return;
      }
      const [xm, ym] = d3.pointer(event, g.node());
      // Hide tooltip if pointer is outside the main chart drawing area (excluding margins)
      if (xm < 0 || xm > width || ym < 0 || ym > height) {
        tooltip.style("opacity", 0);
        return;
      }
      const xScaleCurrent = currentZoomTransform.rescaleX(xScale);
      const hoveredDate = xScaleCurrent.invert(xm);
      // Find the closest data point index
      const bisectDate = d3.bisector(d => d).left;
      const index = bisectDate(filteredDataCache.timestamps, hoveredDate, 1);
      const d0 = filteredDataCache.timestamps[index - 1];
      const d1 = filteredDataCache.timestamps[index];
      let closestIndex;
      if (d0 && d1) {
        closestIndex = (hoveredDate - d0 > d1 - hoveredDate) ? index : index - 1;
      } else if (d0) {
         closestIndex = index - 1;
      } else if (d1) {
         closestIndex = index;
      } else {
        tooltip.style("opacity", 0);
        return; // No points to evaluate against
      }

      if (closestIndex < 0 || closestIndex >= filteredDataCache.timestamps.length) {
        tooltip.style("opacity", 0);
        return;
      }
      const closestTimestamp = filteredDataCache.timestamps[closestIndex];

      // Build Tooltip HTML
      let tooltipHtml = `<div class="tooltip-date">${d3.timeFormat("%Y-%m-%d %H:%M:%S")(closestTimestamp)}</div>`;
      tooltipHtml += "<table>";
      if (colorScale) colorScale.domain(selectedTags); // Ensure domain is set

      selectedTags.forEach(tag => {
        let tagCache = filteredDataCache.tagData[tag];
        let originalValue = "N/A";
        // Check if tagCache and its properties exist before accessing
         if (tagCache && tagCache.originalValues && closestIndex < tagCache.originalValues.length) {
            const val = tagCache.originalValues[closestIndex];
            if (val != null && !isNaN(val)) { // More robust check for null/undefined/NaN
                originalValue = val.toFixed(2); // Format to 2 decimal places
            }
         }
        tooltipHtml += `<tr>
                <td><span style="color:${colorScale ? colorScale(tag) : '#ccc'}; font-weight:bold; margin-right: 4px;">■ ${tag}:</span></td>
                <td style="text-align: right; padding-left: 8px;color:${colorScale ? colorScale(tag) : '#ccc'};">${originalValue}</td>
            </tr>`;
      });

      tooltipHtml += "</table>";
      tooltip.html(tooltipHtml);

      // Position Tooltip relative to the viewport
      const offset = 10;
      tooltip.style("position", "fixed") // Use fixed positioning
             .style("left", (event.clientX + offset) + "px")
             .style("top", (event.clientY + offset) + "px")
             .style("opacity", 0.9); // Make it visible
    }

    // --- New: Update Alarms Display in Table Form ---
    function updateAlarmsDisplay() {
      console.log("Updating alarms display. persistentCursorTimestamp:", persistentCursorTimestamp);
      if (!persistentCursorTimestamp || alarmsData.length === 0) { // Also check if alarmsData is loaded
         alarmDisplay.style.display = 'none';
         alarmDisplay.innerHTML = '';
         return;
      }
      // Define time window (+/- 1 hour)
      const threeHoursMs = 1 * 60 * 60 * 1000;
      const startWindow = new Date(persistentCursorTimestamp.getTime() - threeHoursMs);
      const endWindow = new Date(persistentCursorTimestamp.getTime() + threeHoursMs);

      // Filter alarms within the window
      const matchingAlarms = alarmsData.filter(a => a.timestamp && a.timestamp >= startWindow && a.timestamp <= endWindow);
      console.log("Matching alarms:", matchingAlarms);

      if (matchingAlarms.length > 0) {
         // Build table HTML matching alarms.html structure
         let html = `<h3>Alarms (+/- 1 hour around cursor)</h3>`;
         // Use standard table tags, generic styles from style.css will apply
         html += `<table>
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Tag</th>
                        <th>Type</th>
                        <th class="description-col">Description</th>
                      </tr>
                    </thead>
                    <tbody>`;
         matchingAlarms.forEach(a => {
             // Format timestamp consistently
             const formattedTimestamp = a.timestamp ? d3.timeFormat("%Y-%m-%d %H:%M:%S")(a.timestamp) : 'N/A';
             // Basic sanitization for display (replace < > &)
             const escapeHtml = (unsafe) => {
                if (unsafe === null || unsafe === undefined) return '';
                return String(unsafe)
                     .replace(/&/g, "&")
                     .replace(/</g, "<")
                     .replace(/>/g, ">");
             }

             // *** ADDED: Check for critical alarm type ***
             let rowClass = '';
             if (a.type) { // Check if type exists
                const typeValue = String(a.type).toUpperCase().trim();
                if (typeValue === 'LL' || typeValue === 'HH') {
                    rowClass = ' class="critical-alarm"'; // Add class if critical
                }
             }
             // *******************************************

             // Add the class to the <tr> tag
             html += `<tr${rowClass}>
                        <td>${formattedTimestamp}</td>
                        <td>${escapeHtml(a.tag)}</td>
                        <td>${escapeHtml(a.type)}</td>
                        <td class="description-col">${escapeHtml(a.description)}</td>
                      </tr>`;
         });
         html += `</tbody></table>`;
         alarmDisplay.innerHTML = html;
         alarmDisplay.style.display = 'block'; // Show the container
      } else {
         // If no alarms match, hide the container
         alarmDisplay.style.display = 'none';
         alarmDisplay.innerHTML = '';
      }
    }

    // --- Initial Setup ---
    renderPlottedTagsList(); // Show "No tags added yet" initially
    showChartMessage('Load a CSV file using the "Source" button to view trends.'); // Initial message in chart area
});