/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 0.0, "minX": 0.0, "maxY": 8542.0, "series": [{"data": [[0.0, 0.0], [0.1, 1.0], [0.2, 1.0], [0.3, 1.0], [0.4, 1.0], [0.5, 1.0], [0.6, 1.0], [0.7, 1.0], [0.8, 1.0], [0.9, 1.0], [1.0, 1.0], [1.1, 1.0], [1.2, 2.0], [1.3, 2.0], [1.4, 2.0], [1.5, 2.0], [1.6, 2.0], [1.7, 2.0], [1.8, 2.0], [1.9, 2.0], [2.0, 2.0], [2.1, 2.0], [2.2, 2.0], [2.3, 2.0], [2.4, 2.0], [2.5, 2.0], [2.6, 2.0], [2.7, 2.0], [2.8, 2.0], [2.9, 2.0], [3.0, 2.0], [3.1, 2.0], [3.2, 2.0], [3.3, 2.0], [3.4, 2.0], [3.5, 2.0], [3.6, 3.0], [3.7, 3.0], [3.8, 3.0], [3.9, 3.0], [4.0, 3.0], [4.1, 3.0], [4.2, 3.0], [4.3, 3.0], [4.4, 3.0], [4.5, 3.0], [4.6, 3.0], [4.7, 3.0], [4.8, 3.0], [4.9, 3.0], [5.0, 3.0], [5.1, 3.0], [5.2, 3.0], [5.3, 3.0], [5.4, 3.0], [5.5, 3.0], [5.6, 3.0], [5.7, 4.0], [5.8, 4.0], [5.9, 4.0], [6.0, 4.0], [6.1, 4.0], [6.2, 4.0], [6.3, 4.0], [6.4, 4.0], [6.5, 4.0], [6.6, 4.0], [6.7, 4.0], [6.8, 4.0], [6.9, 4.0], [7.0, 4.0], [7.1, 4.0], [7.2, 4.0], [7.3, 4.0], [7.4, 4.0], [7.5, 5.0], [7.6, 5.0], [7.7, 5.0], [7.8, 5.0], [7.9, 5.0], [8.0, 5.0], [8.1, 5.0], [8.2, 5.0], [8.3, 5.0], [8.4, 5.0], [8.5, 5.0], [8.6, 5.0], [8.7, 5.0], [8.8, 5.0], [8.9, 5.0], [9.0, 6.0], [9.1, 6.0], [9.2, 6.0], [9.3, 6.0], [9.4, 6.0], [9.5, 6.0], [9.6, 6.0], [9.7, 6.0], [9.8, 6.0], [9.9, 6.0], [10.0, 6.0], [10.1, 6.0], [10.2, 6.0], [10.3, 6.0], [10.4, 7.0], [10.5, 7.0], [10.6, 7.0], [10.7, 7.0], [10.8, 7.0], [10.9, 7.0], [11.0, 7.0], [11.1, 7.0], [11.2, 7.0], [11.3, 7.0], [11.4, 7.0], [11.5, 7.0], [11.6, 7.0], [11.7, 8.0], [11.8, 8.0], [11.9, 8.0], [12.0, 8.0], [12.1, 8.0], [12.2, 8.0], [12.3, 8.0], [12.4, 8.0], [12.5, 8.0], [12.6, 8.0], [12.7, 8.0], [12.8, 8.0], [12.9, 8.0], [13.0, 9.0], [13.1, 9.0], [13.2, 9.0], [13.3, 9.0], [13.4, 9.0], [13.5, 9.0], [13.6, 9.0], [13.7, 9.0], [13.8, 9.0], [13.9, 9.0], [14.0, 9.0], [14.1, 9.0], [14.2, 10.0], [14.3, 10.0], [14.4, 10.0], [14.5, 10.0], [14.6, 10.0], [14.7, 10.0], [14.8, 10.0], [14.9, 10.0], [15.0, 10.0], [15.1, 10.0], [15.2, 10.0], [15.3, 11.0], [15.4, 11.0], [15.5, 11.0], [15.6, 11.0], [15.7, 11.0], [15.8, 11.0], [15.9, 11.0], [16.0, 11.0], [16.1, 11.0], [16.2, 11.0], [16.3, 11.0], [16.4, 12.0], [16.5, 12.0], [16.6, 12.0], [16.7, 12.0], [16.8, 12.0], [16.9, 12.0], [17.0, 12.0], [17.1, 12.0], [17.2, 12.0], [17.3, 12.0], [17.4, 12.0], [17.5, 13.0], [17.6, 13.0], [17.7, 13.0], [17.8, 13.0], [17.9, 13.0], [18.0, 13.0], [18.1, 13.0], [18.2, 13.0], [18.3, 13.0], [18.4, 13.0], [18.5, 14.0], [18.6, 14.0], [18.7, 14.0], [18.8, 14.0], [18.9, 14.0], [19.0, 14.0], [19.1, 14.0], [19.2, 14.0], [19.3, 14.0], [19.4, 14.0], [19.5, 14.0], [19.6, 15.0], [19.7, 15.0], [19.8, 15.0], [19.9, 15.0], [20.0, 15.0], [20.1, 15.0], [20.2, 15.0], [20.3, 15.0], [20.4, 15.0], [20.5, 15.0], [20.6, 16.0], [20.7, 16.0], [20.8, 16.0], [20.9, 16.0], [21.0, 16.0], [21.1, 16.0], [21.2, 16.0], [21.3, 16.0], [21.4, 16.0], [21.5, 16.0], [21.6, 17.0], [21.7, 17.0], [21.8, 17.0], [21.9, 17.0], [22.0, 17.0], [22.1, 17.0], [22.2, 17.0], [22.3, 17.0], [22.4, 17.0], [22.5, 18.0], [22.6, 18.0], [22.7, 18.0], [22.8, 18.0], [22.9, 18.0], [23.0, 18.0], [23.1, 18.0], [23.2, 18.0], [23.3, 18.0], [23.4, 19.0], [23.5, 19.0], [23.6, 19.0], [23.7, 19.0], [23.8, 19.0], [23.9, 19.0], [24.0, 19.0], [24.1, 19.0], [24.2, 19.0], [24.3, 20.0], [24.4, 20.0], [24.5, 20.0], [24.6, 20.0], [24.7, 20.0], [24.8, 20.0], [24.9, 20.0], [25.0, 21.0], [25.1, 21.0], [25.2, 21.0], [25.3, 21.0], [25.4, 21.0], [25.5, 21.0], [25.6, 21.0], [25.7, 22.0], [25.8, 22.0], [25.9, 22.0], [26.0, 22.0], [26.1, 22.0], [26.2, 23.0], [26.3, 23.0], [26.4, 23.0], [26.5, 23.0], [26.6, 24.0], [26.7, 24.0], [26.8, 24.0], [26.9, 25.0], [27.0, 25.0], [27.1, 25.0], [27.2, 26.0], [27.3, 26.0], [27.4, 27.0], [27.5, 28.0], [27.6, 28.0], [27.7, 29.0], [27.8, 30.0], [27.9, 32.0], [28.0, 34.0], [28.1, 38.0], [28.2, 71.0], [28.3, 75.0], [28.4, 78.0], [28.5, 80.0], [28.6, 83.0], [28.7, 85.0], [28.8, 87.0], [28.9, 89.0], [29.0, 90.0], [29.1, 92.0], [29.2, 94.0], [29.3, 95.0], [29.4, 97.0], [29.5, 98.0], [29.6, 99.0], [29.7, 101.0], [29.8, 102.0], [29.9, 103.0], [30.0, 105.0], [30.1, 106.0], [30.2, 107.0], [30.3, 108.0], [30.4, 109.0], [30.5, 111.0], [30.6, 112.0], [30.7, 113.0], [30.8, 114.0], [30.9, 115.0], [31.0, 116.0], [31.1, 117.0], [31.2, 118.0], [31.3, 119.0], [31.4, 120.0], [31.5, 120.0], [31.6, 121.0], [31.7, 122.0], [31.8, 123.0], [31.9, 124.0], [32.0, 124.0], [32.1, 125.0], [32.2, 126.0], [32.3, 127.0], [32.4, 127.0], [32.5, 128.0], [32.6, 128.0], [32.7, 129.0], [32.8, 130.0], [32.9, 130.0], [33.0, 131.0], [33.1, 131.0], [33.2, 132.0], [33.3, 132.0], [33.4, 133.0], [33.5, 133.0], [33.6, 134.0], [33.7, 134.0], [33.8, 135.0], [33.9, 135.0], [34.0, 136.0], [34.1, 136.0], [34.2, 136.0], [34.3, 137.0], [34.4, 137.0], [34.5, 138.0], [34.6, 138.0], [34.7, 138.0], [34.8, 139.0], [34.9, 139.0], [35.0, 139.0], [35.1, 140.0], [35.2, 140.0], [35.3, 140.0], [35.4, 141.0], [35.5, 141.0], [35.6, 141.0], [35.7, 142.0], [35.8, 142.0], [35.9, 143.0], [36.0, 143.0], [36.1, 143.0], [36.2, 144.0], [36.3, 144.0], [36.4, 144.0], [36.5, 145.0], [36.6, 145.0], [36.7, 145.0], [36.8, 146.0], [36.9, 146.0], [37.0, 146.0], [37.1, 146.0], [37.2, 147.0], [37.3, 147.0], [37.4, 147.0], [37.5, 148.0], [37.6, 148.0], [37.7, 148.0], [37.8, 149.0], [37.9, 149.0], [38.0, 149.0], [38.1, 150.0], [38.2, 150.0], [38.3, 150.0], [38.4, 150.0], [38.5, 151.0], [38.6, 151.0], [38.7, 151.0], [38.8, 152.0], [38.9, 152.0], [39.0, 152.0], [39.1, 152.0], [39.2, 153.0], [39.3, 153.0], [39.4, 153.0], [39.5, 154.0], [39.6, 154.0], [39.7, 154.0], [39.8, 154.0], [39.9, 155.0], [40.0, 155.0], [40.1, 155.0], [40.2, 156.0], [40.3, 156.0], [40.4, 156.0], [40.5, 157.0], [40.6, 157.0], [40.7, 158.0], [40.8, 158.0], [40.9, 158.0], [41.0, 159.0], [41.1, 159.0], [41.2, 160.0], [41.3, 160.0], [41.4, 161.0], [41.5, 161.0], [41.6, 161.0], [41.7, 162.0], [41.8, 163.0], [41.9, 163.0], [42.0, 164.0], [42.1, 164.0], [42.2, 165.0], [42.3, 165.0], [42.4, 166.0], [42.5, 167.0], [42.6, 168.0], [42.7, 168.0], [42.8, 169.0], [42.9, 171.0], [43.0, 172.0], [43.1, 173.0], [43.2, 175.0], [43.3, 176.0], [43.4, 179.0], [43.5, 182.0], [43.6, 189.0], [43.7, 212.0], [43.8, 219.0], [43.9, 223.0], [44.0, 226.0], [44.1, 229.0], [44.2, 232.0], [44.3, 235.0], [44.4, 238.0], [44.5, 240.0], [44.6, 243.0], [44.7, 245.0], [44.8, 246.0], [44.9, 247.0], [45.0, 248.0], [45.1, 249.0], [45.2, 250.0], [45.3, 251.0], [45.4, 252.0], [45.5, 252.0], [45.6, 253.0], [45.7, 254.0], [45.8, 254.0], [45.9, 255.0], [46.0, 255.0], [46.1, 256.0], [46.2, 257.0], [46.3, 257.0], [46.4, 258.0], [46.5, 258.0], [46.6, 259.0], [46.7, 259.0], [46.8, 260.0], [46.9, 260.0], [47.0, 261.0], [47.1, 261.0], [47.2, 261.0], [47.3, 262.0], [47.4, 262.0], [47.5, 263.0], [47.6, 263.0], [47.7, 263.0], [47.8, 264.0], [47.9, 264.0], [48.0, 265.0], [48.1, 265.0], [48.2, 265.0], [48.3, 266.0], [48.4, 266.0], [48.5, 267.0], [48.6, 267.0], [48.7, 267.0], [48.8, 268.0], [48.9, 268.0], [49.0, 269.0], [49.1, 269.0], [49.2, 269.0], [49.3, 270.0], [49.4, 270.0], [49.5, 271.0], [49.6, 271.0], [49.7, 272.0], [49.8, 272.0], [49.9, 272.0], [50.0, 273.0], [50.1, 273.0], [50.2, 274.0], [50.3, 274.0], [50.4, 275.0], [50.5, 275.0], [50.6, 276.0], [50.7, 276.0], [50.8, 277.0], [50.9, 277.0], [51.0, 278.0], [51.1, 278.0], [51.2, 279.0], [51.3, 280.0], [51.4, 280.0], [51.5, 281.0], [51.6, 282.0], [51.7, 282.0], [51.8, 283.0], [51.9, 283.0], [52.0, 284.0], [52.1, 285.0], [52.2, 285.0], [52.3, 286.0], [52.4, 287.0], [52.5, 288.0], [52.6, 289.0], [52.7, 290.0], [52.8, 291.0], [52.9, 292.0], [53.0, 294.0], [53.1, 295.0], [53.2, 297.0], [53.3, 298.0], [53.4, 300.0], [53.5, 303.0], [53.6, 307.0], [53.7, 312.0], [53.8, 325.0], [53.9, 356.0], [54.0, 368.0], [54.1, 374.0], [54.2, 378.0], [54.3, 383.0], [54.4, 386.0], [54.5, 388.0], [54.6, 391.0], [54.7, 392.0], [54.8, 394.0], [54.9, 395.0], [55.0, 397.0], [55.1, 398.0], [55.2, 399.0], [55.3, 400.0], [55.4, 402.0], [55.5, 403.0], [55.6, 404.0], [55.7, 405.0], [55.8, 406.0], [55.9, 407.0], [56.0, 408.0], [56.1, 408.0], [56.2, 409.0], [56.3, 410.0], [56.4, 411.0], [56.5, 411.0], [56.6, 412.0], [56.7, 413.0], [56.8, 413.0], [56.9, 414.0], [57.0, 414.0], [57.1, 415.0], [57.2, 416.0], [57.3, 416.0], [57.4, 417.0], [57.5, 417.0], [57.6, 418.0], [57.7, 418.0], [57.8, 419.0], [57.9, 420.0], [58.0, 420.0], [58.1, 421.0], [58.2, 422.0], [58.3, 422.0], [58.4, 423.0], [58.5, 423.0], [58.6, 424.0], [58.7, 424.0], [58.8, 425.0], [58.9, 425.0], [59.0, 426.0], [59.1, 426.0], [59.2, 427.0], [59.3, 427.0], [59.4, 428.0], [59.5, 429.0], [59.6, 429.0], [59.7, 430.0], [59.8, 430.0], [59.9, 430.0], [60.0, 431.0], [60.1, 432.0], [60.2, 432.0], [60.3, 433.0], [60.4, 433.0], [60.5, 434.0], [60.6, 434.0], [60.7, 435.0], [60.8, 436.0], [60.9, 436.0], [61.0, 437.0], [61.1, 438.0], [61.2, 438.0], [61.3, 439.0], [61.4, 440.0], [61.5, 441.0], [61.6, 442.0], [61.7, 444.0], [61.8, 445.0], [61.9, 447.0], [62.0, 448.0], [62.1, 450.0], [62.2, 452.0], [62.3, 454.0], [62.4, 457.0], [62.5, 462.0], [62.6, 472.0], [62.7, 483.0], [62.8, 491.0], [62.9, 499.0], [63.0, 505.0], [63.1, 508.0], [63.2, 511.0], [63.3, 513.0], [63.4, 515.0], [63.5, 516.0], [63.6, 517.0], [63.7, 518.0], [63.8, 520.0], [63.9, 521.0], [64.0, 521.0], [64.1, 522.0], [64.2, 523.0], [64.3, 524.0], [64.4, 525.0], [64.5, 525.0], [64.6, 526.0], [64.7, 527.0], [64.8, 528.0], [64.9, 528.0], [65.0, 529.0], [65.1, 530.0], [65.2, 530.0], [65.3, 531.0], [65.4, 532.0], [65.5, 532.0], [65.6, 533.0], [65.7, 534.0], [65.8, 534.0], [65.9, 535.0], [66.0, 536.0], [66.1, 536.0], [66.2, 537.0], [66.3, 537.0], [66.4, 538.0], [66.5, 539.0], [66.6, 539.0], [66.7, 540.0], [66.8, 540.0], [66.9, 541.0], [67.0, 541.0], [67.1, 542.0], [67.2, 543.0], [67.3, 543.0], [67.4, 544.0], [67.5, 545.0], [67.6, 545.0], [67.7, 546.0], [67.8, 547.0], [67.9, 548.0], [68.0, 549.0], [68.1, 549.0], [68.2, 550.0], [68.3, 551.0], [68.4, 551.0], [68.5, 552.0], [68.6, 553.0], [68.7, 554.0], [68.8, 555.0], [68.9, 555.0], [69.0, 556.0], [69.1, 557.0], [69.2, 558.0], [69.3, 560.0], [69.4, 561.0], [69.5, 562.0], [69.6, 563.0], [69.7, 564.0], [69.8, 566.0], [69.9, 567.0], [70.0, 569.0], [70.1, 572.0], [70.2, 574.0], [70.3, 577.0], [70.4, 581.0], [70.5, 586.0], [70.6, 591.0], [70.7, 599.0], [70.8, 617.0], [70.9, 634.0], [71.0, 638.0], [71.1, 642.0], [71.2, 646.0], [71.3, 650.0], [71.4, 653.0], [71.5, 655.0], [71.6, 657.0], [71.7, 660.0], [71.8, 662.0], [71.9, 664.0], [72.0, 666.0], [72.1, 668.0], [72.2, 669.0], [72.3, 670.0], [72.4, 671.0], [72.5, 673.0], [72.6, 674.0], [72.7, 675.0], [72.8, 677.0], [72.9, 678.0], [73.0, 679.0], [73.1, 680.0], [73.2, 681.0], [73.3, 682.0], [73.4, 683.0], [73.5, 684.0], [73.6, 685.0], [73.7, 686.0], [73.8, 686.0], [73.9, 687.0], [74.0, 688.0], [74.1, 689.0], [74.2, 690.0], [74.3, 691.0], [74.4, 691.0], [74.5, 692.0], [74.6, 693.0], [74.7, 693.0], [74.8, 694.0], [74.9, 695.0], [75.0, 696.0], [75.1, 696.0], [75.2, 697.0], [75.3, 698.0], [75.4, 699.0], [75.5, 700.0], [75.6, 701.0], [75.7, 702.0], [75.8, 703.0], [75.9, 704.0], [76.0, 706.0], [76.1, 707.0], [76.2, 708.0], [76.3, 709.0], [76.4, 711.0], [76.5, 712.0], [76.6, 714.0], [76.7, 716.0], [76.8, 719.0], [76.9, 722.0], [77.0, 725.0], [77.1, 730.0], [77.2, 739.0], [77.3, 748.0], [77.4, 759.0], [77.5, 766.0], [77.6, 770.0], [77.7, 773.0], [77.8, 775.0], [77.9, 777.0], [78.0, 780.0], [78.1, 782.0], [78.2, 784.0], [78.3, 786.0], [78.4, 787.0], [78.5, 789.0], [78.6, 790.0], [78.7, 791.0], [78.8, 792.0], [78.9, 794.0], [79.0, 795.0], [79.1, 796.0], [79.2, 796.0], [79.3, 797.0], [79.4, 798.0], [79.5, 799.0], [79.6, 800.0], [79.7, 801.0], [79.8, 802.0], [79.9, 803.0], [80.0, 804.0], [80.1, 805.0], [80.2, 806.0], [80.3, 807.0], [80.4, 808.0], [80.5, 809.0], [80.6, 810.0], [80.7, 811.0], [80.8, 811.0], [80.9, 812.0], [81.0, 813.0], [81.1, 814.0], [81.2, 815.0], [81.3, 816.0], [81.4, 817.0], [81.5, 818.0], [81.6, 819.0], [81.7, 820.0], [81.8, 821.0], [81.9, 822.0], [82.0, 823.0], [82.1, 825.0], [82.2, 826.0], [82.3, 827.0], [82.4, 829.0], [82.5, 832.0], [82.6, 835.0], [82.7, 838.0], [82.8, 841.0], [82.9, 844.0], [83.0, 849.0], [83.1, 854.0], [83.2, 863.0], [83.3, 877.0], [83.4, 887.0], [83.5, 897.0], [83.6, 904.0], [83.7, 908.0], [83.8, 911.0], [83.9, 914.0], [84.0, 919.0], [84.1, 923.0], [84.2, 927.0], [84.3, 930.0], [84.4, 933.0], [84.5, 935.0], [84.6, 938.0], [84.7, 940.0], [84.8, 943.0], [84.9, 945.0], [85.0, 947.0], [85.1, 949.0], [85.2, 951.0], [85.3, 952.0], [85.4, 954.0], [85.5, 955.0], [85.6, 956.0], [85.7, 957.0], [85.8, 959.0], [85.9, 960.0], [86.0, 961.0], [86.1, 962.0], [86.2, 964.0], [86.3, 965.0], [86.4, 966.0], [86.5, 967.0], [86.6, 969.0], [86.7, 970.0], [86.8, 972.0], [86.9, 973.0], [87.0, 974.0], [87.1, 976.0], [87.2, 977.0], [87.3, 978.0], [87.4, 979.0], [87.5, 980.0], [87.6, 982.0], [87.7, 983.0], [87.8, 984.0], [87.9, 986.0], [88.0, 988.0], [88.1, 990.0], [88.2, 993.0], [88.3, 997.0], [88.4, 1001.0], [88.5, 1006.0], [88.6, 1012.0], [88.7, 1018.0], [88.8, 1027.0], [88.9, 1036.0], [89.0, 1041.0], [89.1, 1047.0], [89.2, 1050.0], [89.3, 1053.0], [89.4, 1055.0], [89.5, 1057.0], [89.6, 1058.0], [89.7, 1060.0], [89.8, 1062.0], [89.9, 1063.0], [90.0, 1065.0], [90.1, 1066.0], [90.2, 1067.0], [90.3, 1068.0], [90.4, 1069.0], [90.5, 1070.0], [90.6, 1071.0], [90.7, 1072.0], [90.8, 1073.0], [90.9, 1074.0], [91.0, 1076.0], [91.1, 1077.0], [91.2, 1078.0], [91.3, 1079.0], [91.4, 1080.0], [91.5, 1082.0], [91.6, 1083.0], [91.7, 1084.0], [91.8, 1085.0], [91.9, 1086.0], [92.0, 1088.0], [92.1, 1089.0], [92.2, 1090.0], [92.3, 1092.0], [92.4, 1093.0], [92.5, 1095.0], [92.6, 1096.0], [92.7, 1098.0], [92.8, 1100.0], [92.9, 1102.0], [93.0, 1104.0], [93.1, 1106.0], [93.2, 1109.0], [93.3, 1111.0], [93.4, 1114.0], [93.5, 1117.0], [93.6, 1120.0], [93.7, 1123.0], [93.8, 1128.0], [93.9, 1134.0], [94.0, 1143.0], [94.1, 1153.0], [94.2, 1162.0], [94.3, 1168.0], [94.4, 1172.0], [94.5, 1177.0], [94.6, 1182.0], [94.7, 1186.0], [94.8, 1191.0], [94.9, 1194.0], [95.0, 1198.0], [95.1, 1202.0], [95.2, 1205.0], [95.3, 1209.0], [95.4, 1212.0], [95.5, 1216.0], [95.6, 1220.0], [95.7, 1223.0], [95.8, 1226.0], [95.9, 1229.0], [96.0, 1232.0], [96.1, 1236.0], [96.2, 1240.0], [96.3, 1244.0], [96.4, 1249.0], [96.5, 1256.0], [96.6, 1265.0], [96.7, 1281.0], [96.8, 1295.0], [96.9, 1319.0], [97.0, 1339.0], [97.1, 1364.0], [97.2, 1391.0], [97.3, 1421.0], [97.4, 1459.0], [97.5, 1499.0], [97.6, 1538.0], [97.7, 1610.0], [97.8, 1668.0], [97.9, 1740.0], [98.0, 1788.0], [98.1, 1868.0], [98.2, 1908.0], [98.3, 1936.0], [98.4, 1984.0], [98.5, 2012.0], [98.6, 2035.0], [98.7, 2054.0], [98.8, 2073.0], [98.9, 2103.0], [99.0, 2142.0], [99.1, 2167.0], [99.2, 2179.0], [99.3, 2197.0], [99.4, 2231.0], [99.5, 2274.0], [99.6, 2319.0], [99.7, 2405.0], [99.8, 2604.0], [99.9, 3143.0], [100.0, 8542.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 3088774.0, "series": [{"data": [[0.0, 3088774.0], [600.0, 495324.0], [700.0, 428478.0], [800.0, 413856.0], [900.0, 504821.0], [1000.0, 461669.0], [1100.0, 234671.0], [1200.0, 185866.0], [1300.0, 43581.0], [1400.0, 27589.0], [1500.0, 18816.0], [1600.0, 17655.0], [1700.0, 17376.0], [1800.0, 15522.0], [1900.0, 29679.0], [2000.0, 46137.0], [2100.0, 43649.0], [2200.0, 25530.0], [2300.0, 14354.0], [2400.0, 7364.0], [2500.0, 3636.0], [2600.0, 2516.0], [2800.0, 1184.0], [2700.0, 1369.0], [2900.0, 2121.0], [3000.0, 2285.0], [3100.0, 2580.0], [3300.0, 1197.0], [3200.0, 2047.0], [3400.0, 835.0], [3500.0, 730.0], [3600.0, 527.0], [3700.0, 340.0], [3800.0, 200.0], [3900.0, 194.0], [4000.0, 656.0], [4100.0, 491.0], [4200.0, 223.0], [4300.0, 476.0], [4600.0, 72.0], [4400.0, 187.0], [4500.0, 133.0], [4700.0, 58.0], [4800.0, 26.0], [4900.0, 24.0], [5000.0, 167.0], [5100.0, 111.0], [5300.0, 17.0], [5200.0, 19.0], [5600.0, 9.0], [5500.0, 23.0], [5400.0, 23.0], [5800.0, 14.0], [5700.0, 8.0], [6100.0, 13.0], [5900.0, 10.0], [6000.0, 5.0], [6300.0, 2.0], [6200.0, 6.0], [6600.0, 4.0], [6400.0, 5.0], [6500.0, 36.0], [6700.0, 1.0], [6800.0, 3.0], [6900.0, 2.0], [7100.0, 2.0], [7200.0, 6.0], [7400.0, 1.0], [7300.0, 5.0], [7500.0, 4.0], [7600.0, 1.0], [8500.0, 1.0], [100.0, 1466878.0], [200.0, 1011792.0], [300.0, 195249.0], [400.0, 801286.0], [500.0, 813676.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 8500.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 259.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 6565341.0, "series": [{"data": [[1.0, 3608172.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 259.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 6565341.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 260425.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 748.530136432416, "minX": 1.53080682E12, "maxY": 10000.0, "series": [{"data": [[1.53080724E12, 10000.0], [1.53080694E12, 4465.979682950177], [1.53080742E12, 9882.786930815186], [1.53080688E12, 2424.1313270598407], [1.53080736E12, 10000.0], [1.53080706E12, 8471.206294923313], [1.530807E12, 6474.361160580913], [1.53080718E12, 10000.0], [1.53080712E12, 9930.854769861511], [1.53080682E12, 748.530136432416], [1.5308073E12, 10000.0]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53080742E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 0.0, "minX": 19.0, "maxY": 3413.0, "series": [{"data": [[19.0, 36.64814814814814], [20.0, 1.7698412698412693], [21.0, 1.7902621722846443], [22.0, 4.393700787401575], [23.0, 107.5], [26.0, 4.415094339622643], [27.0, 1.489690721649485], [28.0, 1.2861400894187796], [29.0, 1.2143999999999975], [30.0, 1.2722929936305742], [31.0, 4.523076923076923], [33.0, 5.470297029702967], [8577.0, 776.7792746113992], [8321.0, 1029.6666666666667], [34.0, 1.389328063241107], [35.0, 1.2982456140350884], [8705.0, 502.63184392699793], [8833.0, 321.65116279069764], [9089.0, 1017.0], [36.0, 1.3708333333333342], [37.0, 2.9338842975206614], [9345.0, 1010.9648682559607], [9473.0, 620.4838455476759], [38.0, 69.0], [39.0, 5.290393013100439], [9857.0, 1092.647058823529], [9985.0, 1153.5], [9729.0, 415.0], [40.0, 3.1911392405063297], [41.0, 1.1394686907020877], [42.0, 1.906976744186047], [43.0, 1652.5], [44.0, 156.13157894736838], [45.0, 1.299356223175968], [46.0, 1.157415832575069], [47.0, 1.4398073836276088], [49.0, 17.404444444444437], [50.0, 3.9043392504930963], [51.0, 1.2559158632778296], [52.0, 1.474626865671641], [54.0, 8.685520361990944], [55.0, 1.2454780361757098], [56.0, 1.5604838709677424], [57.0, 1555.0], [59.0, 467.75], [60.0, 8.744855967078204], [61.0, 1.3022801302931606], [62.0, 11.363445378151262], [63.0, 1521.0], [64.0, 11.106884057971003], [65.0, 2.516003122560498], [66.0, 1.5367156208277701], [67.0, 0.9240506329113922], [68.0, 0.9722222222222222], [69.0, 0.8944444444444443], [70.0, 25.544715447154474], [71.0, 0.9175257731958762], [72.0, 56.65789473684211], [73.0, 44.841666666666654], [74.0, 3.307904411764708], [75.0, 67.0], [76.0, 52.520547945205486], [77.0, 2.975694444444447], [78.0, 2.097868981846883], [79.0, 1253.2], [80.0, 69.0], [81.0, 6.471279373368137], [82.0, 2.9537815126050404], [83.0, 80.42857142857143], [85.0, 6.965546218487386], [86.0, 4.72664835164835], [87.0, 4.983193277310924], [89.0, 15.751807228915665], [90.0, 2.4999999999999982], [91.0, 18.277310924369747], [88.0, 1587.0], [92.0, 814.75], [93.0, 6.154465004022532], [94.0, 2.8259687287559503], [95.0, 36.40909090909091], [96.0, 570.0], [97.0, 14.560475161987041], [98.0, 3.600472813238774], [99.0, 6.594936708860758], [100.0, 70.0], [101.0, 7.788402848423205], [102.0, 2.9725519287833837], [103.0, 5.583143507972665], [104.0, 198.7073170731707], [105.0, 21.81818181818182], [106.0, 0.9069767441860463], [107.0, 37.37626262626261], [108.0, 3.1787858572381604], [109.0, 7.351877607788596], [111.0, 22.299065420560748], [110.0, 1553.0], [112.0, 2.031230480949408], [113.0, 6.8869463869463825], [114.0, 1110.6666666666667], [115.0, 19.746031746031726], [116.0, 2.1461214672278977], [117.0, 3.082767978290369], [118.0, 70.0], [119.0, 43.272727272727295], [120.0, 3.313506815365556], [121.0, 4.598028477546552], [122.0, 68.0], [123.0, 17.185483870967754], [124.0, 2.3060224089635812], [125.0, 3.5281030444964827], [127.0, 28.365591397849474], [128.0, 4.4883148831488295], [130.0, 254.0], [132.0, 3.5430183356840645], [134.0, 888.0], [136.0, 2.628853984874924], [140.0, 348.5], [138.0, 1090.0], [142.0, 14.020194986072436], [146.0, 9.886490807354104], [148.0, 71.63333333333333], [150.0, 6.0377224199288255], [152.0, 70.0], [154.0, 8.260374288039051], [156.0, 69.0], [158.0, 11.312030075187964], [162.0, 9.664827586206892], [160.0, 68.0], [166.0, 10.25137741046832], [168.0, 52.0], [170.0, 14.557377049180342], [172.0, 0.7741935483870968], [174.0, 27.333333333333332], [176.0, 36.41065830720998], [178.0, 10.64965986394558], [180.0, 89.5], [182.0, 3.750838926174493], [186.0, 3.4522058823529447], [188.0, 70.0], [190.0, 3.5398970398970433], [184.0, 1589.0], [194.0, 4.226911314984706], [196.0, 124.88461538461539], [198.0, 4.536945812807882], [200.0, 69.4], [202.0, 7.398753894080999], [206.0, 3.8480420806545896], [204.0, 2147.0], [208.0, 0.9607843137254901], [210.0, 0.91358024691358], [212.0, 0.8653846153846154], [214.0, 4.64003436426117], [216.0, 69.69014084507042], [218.0, 6.244170984455954], [222.0, 4.685758513931883], [226.0, 9.756929637526662], [230.0, 4.108490566037737], [224.0, 2256.0], [234.0, 4.40453074433657], [238.0, 6.462077756532825], [236.0, 2256.6666666666665], [240.0, 1163.0], [242.0, 5.084178498985794], [244.0, 25.734375], [246.0, 1.076923076923077], [248.0, 18.072507552870096], [250.0, 7.101010101010104], [252.0, 26.642570281124463], [254.0, 2251.5], [256.0, 7.980139026812305], [268.0, 61.400862068965544], [260.0, 48.41682974559688], [264.0, 56.28542510121461], [272.0, 52.777493606138066], [276.0, 84.0], [280.0, 1.0], [284.0, 151.53906249999991], [288.0, 56.52014652014652], [292.0, 61.1559633027523], [296.0, 120.51162790697674], [316.0, 1.9117647058823535], [308.0, 1163.5], [312.0, 51.766590389015995], [332.0, 34.199759326113075], [320.0, 59.2670744138634], [324.0, 24.91194420226676], [328.0, 25.96283185840709], [336.0, 54.802850356294535], [340.0, 27.25], [344.0, 19.24615384615385], [348.0, 85.11428571428571], [352.0, 9.26451612903226], [356.0, 36.482091690544486], [360.0, 9.03388278388279], [364.0, 7.511111111111106], [380.0, 6.470588235294118], [368.0, 20.763698630137025], [372.0, 7.365629420084856], [376.0, 24.986572890025542], [384.0, 1813.2], [388.0, 43.65822784810126], [392.0, 11.615263571990559], [396.0, 9.172077922077918], [400.0, 17.899772209567193], [412.0, 12.92245720040282], [404.0, 8.371428571428572], [408.0, 15.229383886255913], [416.0, 29.464063384267153], [420.0, 74.25691699604747], [424.0, 45.48275862068965], [428.0, 22.532786885245898], [432.0, 12.086914062499979], [436.0, 20.698795180722893], [440.0, 11.23155929038284], [444.0, 8.38095238095238], [448.0, 11.816401468788236], [452.0, 34.98067010309281], [456.0, 0.9032258064516129], [460.0, 0.9523809523809524], [464.0, 9.790816326530608], [468.0, 18.623955431754872], [472.0, 11.507103825136614], [476.0, 9.590177133655395], [480.0, 9.696638655462179], [484.0, 9.540421792618638], [488.0, 27.082807278128524], [492.0, 70.29238754325262], [496.0, 0.9687499999999999], [500.0, 11.240687679083102], [504.0, 70.0], [508.0, 44.2], [512.0, 70.0], [528.0, 28.757926306769395], [536.0, 70.0], [520.0, 10.396800000000002], [544.0, 12.881481481481481], [568.0, 0.880952380952381], [560.0, 11.71846153846154], [552.0, 10.707364341085277], [576.0, 73.0], [592.0, 14.027613412228796], [600.0, 12.67466835123185], [584.0, 895.2857142857142], [608.0, 54.30217028380637], [632.0, 19.158590308370044], [624.0, 55.34125874125872], [616.0, 158.0], [640.0, 39.69565217391304], [664.0, 49.819148936170244], [656.0, 69.0], [648.0, 55.46487603305785], [672.0, 0.9141104294478526], [688.0, 215.83333333333331], [680.0, 49.96087636932703], [728.0, 78.0], [720.0, 54.9443207126949], [712.0, 121.86809815950917], [704.0, 891.0], [736.0, 60.70540098199675], [752.0, 25.431914893617016], [760.0, 38.68196131354036], [744.0, 0.9202453987730058], [768.0, 40.041037735849045], [784.0, 21.270270270270252], [792.0, 34.39116842516602], [776.0, 0.9039999999999998], [800.0, 26.1343381389253], [824.0, 20.375174337517407], [816.0, 0.8695652173913041], [808.0, 58.93025641025643], [832.0, 19.207792207792213], [848.0, 64.3733333333333], [856.0, 75.0], [840.0, 34.6082365364308], [864.0, 18.820234113712402], [888.0, 30.433333333333334], [880.0, 46.17684478371494], [872.0, 21.799145299145298], [896.0, 18.59402985074626], [912.0, 18.58769633507853], [920.0, 23.648330058939106], [904.0, 25.661538461538452], [928.0, 71.60952380952382], [952.0, 107.0], [944.0, 613.6666666666666], [936.0, 39.66666666666667], [960.0, 0.6666666666666666], [984.0, 59.58419497784348], [976.0, 52.81211498973299], [968.0, 83.0], [992.0, 22.256410256410252], [1008.0, 12.428571428571429], [1016.0, 186.16666666666669], [1000.0, 58.20331950207472], [1024.0, 7.162241887905605], [1056.0, 78.5], [1072.0, 878.0], [1088.0, 61.294930875576064], [1120.0, 22.71937984496124], [1136.0, 81.72118380062314], [1104.0, 37.497262773722575], [1152.0, 53.76965065502187], [1184.0, 76.0], [1200.0, 52.90562347188266], [1168.0, 60.09170305676858], [1216.0, 349.3333333333333], [1264.0, 83.55384615384618], [1248.0, 22.111111111111097], [1232.0, 82.0], [1280.0, 57.71087216248508], [1312.0, 60.67034393251132], [1296.0, 80.18181818181819], [1344.0, 91.24238578680202], [1376.0, 81.72158365261808], [1392.0, 64.64444444444445], [1360.0, 60.25], [1408.0, 78.93397524071536], [1456.0, 70.07682876992223], [1440.0, 6.605633802816901], [1424.0, 113.96000000000002], [1472.0, 5.28169014084507], [1504.0, 72.37041351193945], [1488.0, 81.40090090090082], [1584.0, 94.98125], [1552.0, 4.3476702508960585], [1536.0, 862.0], [1600.0, 73.73700305810395], [1632.0, 61.3102852203976], [1648.0, 68.62425149700594], [1616.0, 54.43010752688174], [1664.0, 92.27964860907768], [1696.0, 109.43636363636365], [1712.0, 48.16129032258066], [1680.0, 55.42129629629632], [1728.0, 77.56893880712609], [1776.0, 69.43379237288136], [1760.0, 56.89443651925822], [1744.0, 93.77130044843038], [1792.0, 69.14850249584022], [1808.0, 47.86666666666665], [1824.0, 34.48611111111111], [1840.0, 151.42857142857144], [1904.0, 127.05357142857146], [1872.0, 10.574468085106384], [1888.0, 124.19341563786], [1920.0, 85.11016949152543], [1936.0, 90.62210694333606], [1952.0, 59.06585365853661], [1968.0, 9.074074074074073], [1984.0, 111.19480519480521], [2000.0, 75.44673768308924], [2016.0, 68.7445255474453], [2032.0, 303.9081196581199], [2048.0, 104.2837837837838], [2080.0, 56.78953488372098], [2112.0, 52.2], [2144.0, 36.666666666666664], [2208.0, 111.16738727609624], [2240.0, 69.16097122302158], [2176.0, 843.0], [2336.0, 105.5397973950795], [2368.0, 94.23214285714288], [2400.0, 834.5], [2496.0, 91.24618736383441], [2528.0, 168.48240635641318], [2464.0, 832.0], [2432.0, 832.0], [2656.0, 133.2628624883067], [2624.0, 110.02672147995888], [2688.0, 185.88487155090388], [2752.0, 821.0], [2816.0, 141.30866025166574], [2848.0, 216.52577319587635], [2880.0, 225.12006861063475], [2912.0, 850.0], [2944.0, 110.37462235649551], [2976.0, 146.61538461538467], [3008.0, 179.99359999999996], [3040.0, 351.0], [3072.0, 78.06122448979592], [3200.0, 154.1865348980851], [3232.0, 217.67055393586017], [3296.0, 22.0], [3328.0, 164.0484391819158], [3360.0, 188.5197401299348], [3552.0, 504.219512195122], [3488.0, 82.25410628019334], [3520.0, 191.60408560311282], [3648.0, 166.63900414937754], [3680.0, 339.34033613445354], [3712.0, 217.29905063291105], [3744.0, 261.0], [3808.0, 91.65612648221352], [3936.0, 276.2339901477835], [3968.0, 125.16999232540303], [4000.0, 581.924050632911], [4032.0, 422.6875], [4096.0, 195.7826086956522], [4288.0, 431.2935064935063], [4416.0, 416.93387866394033], [4544.0, 104.61719383617196], [4736.0, 304.17753389283416], [4672.0, 1420.0], [4928.0, 392.1837307152877], [4992.0, 533.0], [5056.0, 1062.6], [5120.0, 428.5], [5184.0, 208.0322580645162], [5312.0, 457.2173144876326], [5376.0, 335.830267062315], [5440.0, 576.0], [5568.0, 324.28218694885373], [5632.0, 123.867741935484], [5824.0, 219.5879945429742], [5696.0, 1239.0], [6016.0, 1038.3333333333333], [5888.0, 1237.0], [6144.0, 672.604033970275], [6208.0, 20.0], [6272.0, 481.9972542559031], [6400.0, 728.25], [6464.0, 622.7036144578313], [6592.0, 310.3498659517428], [6656.0, 123.19949494949508], [6720.0, 304.2800840777718], [6912.0, 793.0], [6976.0, 246.7337917485268], [7232.0, 306.11607533946574], [7296.0, 789.1739130434784], [7360.0, 596.6695174098963], [7552.0, 208.11401869158888], [7616.0, 843.8549295774638], [7424.0, 1046.0], [7680.0, 292.83587140439937], [7872.0, 530.5], [8000.0, 729.0], [8064.0, 747.5268505079829], [8448.0, 128.85961713764817], [8576.0, 1569.4], [8192.0, 1032.5], [8704.0, 1280.7517006802716], [8832.0, 192.09813463098124], [8960.0, 453.83566200931455], [9088.0, 241.6708307307933], [9472.0, 1108.9473684210548], [9600.0, 843.0], [9216.0, 600.75], [9728.0, 266.6002994011975], [9856.0, 1618.0], [9984.0, 1074.8014184397166], [8195.0, 694.7312546399414], [8323.0, 305.827380952381], [8451.0, 251.50277264325305], [8579.0, 2208.0], [8835.0, 339.200480192077], [9091.0, 327.40318302387203], [9219.0, 490.4142857142859], [9347.0, 172.0], [9475.0, 757.0], [9603.0, 615.6493506493506], [9731.0, 438.80442477876096], [9859.0, 512.7070594774877], [9987.0, 933.1286449399657], [4097.0, 25.0], [4161.0, 374.2848575712149], [4225.0, 229.0], [4289.0, 332.5481520041645], [4353.0, 20.0], [4417.0, 400.73866348448684], [4545.0, 234.0], [4609.0, 294.18838992332957], [4737.0, 419.27467811158806], [4801.0, 319.1062030075186], [4673.0, 1259.0], [4929.0, 254.46728971962634], [5057.0, 1074.0], [5313.0, 457.0], [5249.0, 1247.0], [5121.0, 1250.0], [5377.0, 933.0], [5441.0, 428.3847191011248], [5569.0, 238.0], [5633.0, 99.89055793991423], [5761.0, 743.0], [5825.0, 445.4759036144579], [5697.0, 1239.5], [5889.0, 552.6977547495692], [5953.0, 363.96830427892235], [6017.0, 1235.0], [6145.0, 703.9863636363631], [6273.0, 558.0], [6337.0, 234.38827838827845], [6465.0, 671.1545268890397], [6593.0, 62.0], [6529.0, 1221.0], [6401.0, 1224.0], [6721.0, 133.19827586206887], [6785.0, 611.089696969698], [6849.0, 1215.5], [6657.0, 1219.6666666666667], [7041.0, 715.0370370370366], [7105.0, 1054.0], [7169.0, 998.8], [7233.0, 441.5132743362833], [7297.0, 164.8299632352942], [7617.0, 291.0655542312276], [7681.0, 323.63267670915417], [7745.0, 628.965556831227], [7873.0, 720.1635220125784], [7937.0, 264.5], [8001.0, 1006.625], [8065.0, 422.7574039067424], [8129.0, 796.504366812227], [8194.0, 773.5652582159628], [8322.0, 293.5391221374048], [8578.0, 1496.0], [8706.0, 162.52736318407972], [9218.0, 886.1069182389944], [9346.0, 164.82205029013545], [9602.0, 697.562705187131], [9474.0, 434.0], [9858.0, 636.9757575757569], [9986.0, 211.0], [9730.0, 416.0], [8581.0, 2234.3121272365775], [8325.0, 1030.0], [8709.0, 292.28906250000017], [8965.0, 793.1238532110088], [8837.0, 1016.3333333333334], [9221.0, 799.0], [9477.0, 190.42560406952097], [9605.0, 900.0], [9349.0, 1383.0], [9861.0, 1189.0], [2049.0, 68.72945205479458], [2145.0, 68.69102990033215], [2113.0, 86.59599156118144], [2273.0, 66.44318181818176], [2209.0, 117.61904761904762], [2241.0, 60.90575275397793], [2177.0, 842.0], [2305.0, 654.5], [2401.0, 653.75], [2337.0, 140.47881355932208], [2369.0, 140.56102362204732], [2465.0, 389.66666666666663], [2529.0, 106.54018445322785], [2561.0, 187.7221777421939], [2593.0, 193.5], [2689.0, 111.1884615384616], [2721.0, 220.27579556412752], [2785.0, 820.0], [2817.0, 157.7608695652174], [2849.0, 115.63753213367626], [2881.0, 156.732797589151], [2913.0, 252.08749999999998], [3009.0, 133.5190839694655], [2977.0, 849.0], [3073.0, 380.4104308390022], [3169.0, 248.0], [3297.0, 264.09189189189186], [3233.0, 171.51909090909106], [3265.0, 196.69138418079078], [3329.0, 107.77168949771695], [3361.0, 147.9577981651376], [3393.0, 213.10093549975366], [3457.0, 248.0], [3553.0, 111.74366085578446], [3521.0, 179.9895833333332], [3585.0, 221.50685975609727], [3681.0, 136.95588235294116], [3809.0, 128.46560846560845], [3713.0, 126.21659919028328], [3745.0, 203.24193548387095], [3841.0, 218.39307787391894], [3873.0, 372.66024096385553], [4001.0, 131.60765550239194], [4065.0, 493.0], [4162.0, 357.4765550239234], [4482.0, 207.20322394933802], [4610.0, 139.3245749613601], [4674.0, 310.8071216617209], [4738.0, 430.0], [4802.0, 393.6149019607844], [4866.0, 247.5], [4930.0, 449.07692307692304], [4994.0, 206.55071746660064], [5058.0, 236.80177400694203], [5122.0, 370.55469087764783], [5250.0, 495.22413793103414], [5378.0, 539.0], [5442.0, 489.3778625954201], [5506.0, 242.95711060948068], [5570.0, 1241.0], [5634.0, 95.5394112060778], [5698.0, 461.61652679147863], [5826.0, 1238.0], [5890.0, 138.19592476489046], [5954.0, 323.20267909143803], [6018.0, 221.5447154471545], [6082.0, 629.112426035503], [6146.0, 165.61904761904765], [6210.0, 378.34495084897213], [6338.0, 185.65119687347314], [6402.0, 246.71259842519677], [6466.0, 808.0], [6530.0, 576.3390313390317], [6594.0, 1220.0], [6786.0, 682.7621722846443], [6850.0, 273.5903614457833], [6914.0, 787.8947368421059], [7042.0, 187.32609569762755], [7106.0, 655.0], [7170.0, 807.0546874999998], [7234.0, 508.0], [7298.0, 258.0], [7426.0, 205.18591279348345], [7490.0, 838.4214350590379], [7746.0, 758.1527494908352], [7810.0, 203.6362339514979], [7874.0, 597.0155778894473], [7938.0, 215.21760797342182], [8002.0, 533.065868263473], [8130.0, 844.1417666303165], [8196.0, 230.0], [8452.0, 342.3458980044345], [8580.0, 2179.8026315789475], [8836.0, 283.57622377622386], [8964.0, 595.6580086580088], [9092.0, 174.47395833333337], [8708.0, 1020.0], [9476.0, 276.67307692307696], [9220.0, 529.6], [9732.0, 394.32779783393556], [9988.0, 184.7266503667484], [8199.0, 290.2901124925992], [8327.0, 759.1073762838474], [8455.0, 565.0], [8583.0, 233.0], [8711.0, 441.11675126903566], [8839.0, 513.3450292397662], [9095.0, 284.3228643216077], [9223.0, 175.13301282051296], [9351.0, 268.73076923076934], [9479.0, 465.81818181818187], [9607.0, 90.91889117043131], [9735.0, 627.8628048780486], [9863.0, 755.5609048723904], [4099.0, 456.95491143317196], [4227.0, 329.83356070941335], [4355.0, 201.07950680272106], [4483.0, 180.15938303341918], [4547.0, 190.45796460176993], [4675.0, 320.57430555555544], [4803.0, 1260.0], [4739.0, 1259.0], [4867.0, 210.46552856204863], [4995.0, 160.13051146384493], [5059.0, 678.6666666666666], [5123.0, 200.99180327868862], [5251.0, 126.85296981499512], [5315.0, 565.9875930521092], [5507.0, 178.43841807909604], [5443.0, 1243.5], [5379.0, 1245.0], [5635.0, 171.0], [5699.0, 191.64988558352385], [5763.0, 214.62325349301403], [5827.0, 1237.5], [5955.0, 874.0], [6019.0, 135.91125760649103], [6083.0, 624.5235109717879], [6147.0, 260.0], [6211.0, 373.8385989010993], [6275.0, 753.5], [6339.0, 369.6666666666667], [6403.0, 356.9003522898836], [6531.0, 725.4754385964909], [6595.0, 585.8933823529417], [6659.0, 183.3354564755839], [6787.0, 768.0], [6851.0, 258.51880141010594], [6915.0, 282.2698083894352], [6979.0, 537.3544474393532], [7107.0, 654.3642611683838], [7043.0, 1056.0], [7171.0, 491.7279829545456], [7363.0, 1047.0], [7427.0, 334.911458333333], [7491.0, 663.6819819819822], [7555.0, 395.76367961934955], [7619.0, 1041.0], [7747.0, 1349.5], [7811.0, 246.79132040627871], [7875.0, 709.9054054054052], [7683.0, 1952.6666666666667], [7939.0, 203.0987854251012], [8003.0, 597.5008787346225], [8131.0, 969.6666666666666], [8198.0, 241.39354838709684], [8326.0, 636.7645478961492], [8582.0, 1481.5555555555554], [8710.0, 554.0022205773505], [8838.0, 595.0], [9094.0, 357.6822157434403], [8966.0, 1013.0], [9222.0, 266.11367673179404], [9350.0, 235.0656857593276], [9478.0, 129.64912280701765], [9606.0, 667.8417266187055], [9734.0, 623.0], [9862.0, 1285.852216748768], [8457.0, 483.9076644538324], [8585.0, 520.2613636363642], [8201.0, 1032.0], [8713.0, 852.6666666666666], [8969.0, 505.1053459119494], [9097.0, 1205.3740601503762], [9481.0, 696.3438066465251], [9225.0, 600.5], [9993.0, 269.7985685071574], [9865.0, 404.0], [9737.0, 415.4], [1025.0, 124.89473684210527], [1073.0, 75.47500000000002], [1057.0, 63.78697421981003], [1041.0, 123.66666666666666], [1089.0, 42.08904109589043], [1105.0, 82.0], [1121.0, 876.5], [1153.0, 21.704365079365072], [1185.0, 52.359546452084885], [1201.0, 62.34630350194552], [1169.0, 56.770250368188535], [1217.0, 76.0], [1265.0, 60.39218241042363], [1249.0, 26.209677419354833], [1281.0, 77.35059037238871], [1329.0, 84.77510917030573], [1313.0, 72.1722158438576], [1297.0, 66.3], [1345.0, 45.613612565445024], [1393.0, 12.928571428571427], [1361.0, 100.75714285714295], [1409.0, 59.45400593471803], [1457.0, 27.183520599250944], [1441.0, 94.933014354067], [1425.0, 89.55546813532645], [1473.0, 75.42105263157893], [1505.0, 4.739130434782609], [1521.0, 50.408026755852894], [1489.0, 19.63291139240506], [1537.0, 59.01398601398605], [1569.0, 44.91711229946518], [1585.0, 166.56772334293936], [1553.0, 13.277777777777779], [1601.0, 72.15622119815657], [1633.0, 84.93495934959351], [1649.0, 76.23898963730564], [1617.0, 82.28657534246564], [1665.0, 110.9875776397516], [1681.0, 51.596695821185605], [1713.0, 857.0], [1697.0, 857.0], [1777.0, 85.23798627002284], [1745.0, 106.0290456431536], [1761.0, 161.6666666666666], [1729.0, 856.0], [1793.0, 92.51987281399035], [1809.0, 79.58709677419343], [1825.0, 56.857764876632814], [1841.0, 64.45571748878913], [1857.0, 59.045918367346914], [1873.0, 50.60843373493975], [1905.0, 136.99999999999997], [1921.0, 61.39402173913042], [1937.0, 128.08450704225348], [1953.0, 116.7033374536465], [1969.0, 93.30934532733633], [1985.0, 92.79129819596722], [2001.0, 104.81838074398252], [2017.0, 105.73809523809517], [2146.0, 131.29934210526312], [2114.0, 83.55526770293612], [2082.0, 844.0], [2274.0, 112.97752808988777], [2178.0, 157.24220623501213], [2242.0, 126.77931341952745], [2210.0, 840.0], [2306.0, 89.97560975609755], [2338.0, 56.84797297297298], [2402.0, 128.67264573991028], [2434.0, 134.05287623474715], [2530.0, 139.11965811965808], [2466.0, 259.2413793103448], [2498.0, 102.0], [2562.0, 113.24533715925395], [2594.0, 146.19081272084756], [2626.0, 105.0], [2722.0, 127.59252336448601], [2754.0, 192.09244791666677], [2818.0, 237.0], [2914.0, 191.24264705882362], [2946.0, 304.6666666666667], [3042.0, 118.46820590461765], [2978.0, 104.0], [3074.0, 179.62406483790542], [3106.0, 187.6192584394022], [3298.0, 189.30043103448287], [3234.0, 249.0], [3266.0, 160.92979297929796], [3394.0, 119.12209302325573], [3426.0, 89.70107526881716], [3522.0, 167.3702127659575], [3586.0, 187.40855704697984], [3618.0, 211.1857855361598], [3746.0, 186.56460674157316], [3778.0, 334.0288135593221], [3842.0, 95.17571884984037], [3874.0, 314.9717277486916], [4002.0, 140.0], [4034.0, 379.4836065573771], [4066.0, 512.0], [4100.0, 343.1883228391524], [4164.0, 526.0], [4228.0, 282.2165397170837], [4356.0, 141.70707070707064], [4548.0, 205.65937803692896], [4740.0, 522.1299638989168], [4804.0, 471.0], [4868.0, 341.9475341028336], [4932.0, 190.02127659574495], [4996.0, 1253.0], [5188.0, 376.69670200235583], [5316.0, 253.2889532079119], [5252.0, 1247.0], [5380.0, 222.4296807592751], [5508.0, 399.3907692307691], [5572.0, 209.79825834542808], [5636.0, 246.0], [5764.0, 256.86198547215474], [5828.0, 558.0748230535893], [5956.0, 512.0], [6084.0, 518.3183153770814], [6276.0, 190.44957264957262], [6340.0, 759.0], [6148.0, 1232.5], [6404.0, 431.8000000000001], [6468.0, 351.9082774049219], [6596.0, 635.5436974789911], [6660.0, 233.7451381780962], [6724.0, 186.58691588785064], [6852.0, 300.63185840707933], [6916.0, 141.19765166340497], [6980.0, 729.1049046321532], [7044.0, 1019.6666666666666], [7108.0, 433.1637500000003], [7172.0, 169.70679380214534], [7236.0, 660.3418621179817], [7364.0, 1048.0], [7300.0, 1048.5], [7428.0, 529.0], [7556.0, 375.81065088757407], [7620.0, 1597.8333333333333], [7812.0, 1039.0], [7684.0, 1040.5], [8068.0, 493.32978723404193], [8200.0, 426.30434782608705], [8456.0, 562.718562874251], [8584.0, 233.0], [8840.0, 512.9752161383282], [8968.0, 963.8603117505988], [9096.0, 1410.0], [9224.0, 328.06474820143876], [9352.0, 747.5], [9480.0, 488.8858560794047], [9608.0, 348.6666666666667], [9736.0, 497.0800209205026], [9992.0, 384.9930313588857], [9864.0, 1720.5], [8203.0, 473.86532951289377], [8331.0, 984.5061728395062], [8587.0, 2384.0], [8459.0, 1027.0], [8715.0, 754.463942307692], [8843.0, 949.9287469287472], [9227.0, 331.80173292558686], [9355.0, 475.4860759493673], [9611.0, 337.8490566037738], [9739.0, 914.1899999999999], [9867.0, 598.3417385534156], [9995.0, 211.66666666666666], [4101.0, 256.0], [4293.0, 201.26540284360206], [4357.0, 221.0], [4421.0, 122.08648648648658], [4613.0, 236.35855546001739], [4741.0, 277.2955343702965], [4805.0, 1080.0], [4933.0, 188.55288822205543], [5061.0, 1251.0], [5189.0, 316.130268199234], [5253.0, 1247.0], [5125.0, 1250.0], [5381.0, 120.59813084112159], [5509.0, 543.0], [5573.0, 256.5925526173769], [5637.0, 216.61402508551896], [5701.0, 101.0], [5829.0, 462.6140651801032], [5893.0, 261.0], [6149.0, 183.42242295430393], [6277.0, 273.71282527880976], [6341.0, 527.6696990902734], [6469.0, 134.51838064215895], [6597.0, 1220.0], [6533.0, 1221.0], [6725.0, 338.15716657443295], [6917.0, 232.0], [7045.0, 248.00888324873105], [7109.0, 1053.0], [6981.0, 1057.0], [7173.0, 891.2], [7237.0, 724.4271725826193], [7301.0, 290.24033149171225], [7365.0, 821.845410628019], [7621.0, 173.4174553101997], [7557.0, 1271.8333333333335], [7685.0, 672.3600692440833], [8005.0, 789.1666666666666], [8069.0, 239.79949874686722], [8133.0, 1028.0], [8458.0, 845.0], [8586.0, 315.4336569579283], [8714.0, 775.728155339806], [8842.0, 540.1666666666666], [8970.0, 197.5], [9098.0, 878.1134368669831], [9226.0, 488.5094339622641], [9354.0, 421.7206870799105], [9482.0, 681.6637931034481], [9610.0, 163.88117081695069], [9738.0, 903.0], [9866.0, 1382.2447552447559], [9994.0, 517.6], [8205.0, 948.0], [8461.0, 705.9756097560975], [8589.0, 1450.0], [8845.0, 129.9375], [8973.0, 294.3512793176973], [9101.0, 1733.6386986301386], [8717.0, 1020.5], [9357.0, 768.6666666666666], [9485.0, 566.0090322580648], [9613.0, 447.9545454545455], [9741.0, 1110.9115044247785], [9869.0, 967.6666666666667], [9997.0, 442.73495370370364], [2147.0, 122.6702290076336], [2083.0, 328.9411764705882], [2115.0, 64.8951048951049], [2275.0, 145.49584487534636], [2179.0, 111.64539748953969], [2243.0, 100.66476190476189], [2211.0, 840.5], [2307.0, 115.74912403644], [2339.0, 72.39474987617623], [2371.0, 60.30364372469637], [2403.0, 106.86700125470507], [2435.0, 126.05069124423956], [2467.0, 184.34241598546785], [2499.0, 159.04410011918947], [2595.0, 107.30655737704924], [2627.0, 158.48757763975146], [2755.0, 144.75233388248188], [2787.0, 168.53196179279954], [2723.0, 822.0], [2915.0, 149.4979235880398], [2883.0, 232.0], [2819.0, 819.5], [2947.0, 176.00764655904828], [3043.0, 672.0], [3075.0, 76.64414414414425], [3107.0, 142.39847715736042], [3139.0, 163.51150269211925], [3171.0, 178.93809523809531], [3235.0, 249.0], [3363.0, 214.46153846153848], [3427.0, 102.88712522045844], [3459.0, 185.6257217847771], [3491.0, 305.9263598326356], [3619.0, 198.56075874333158], [3651.0, 285.3], [3587.0, 1077.0], [3747.0, 187.44034707158409], [3779.0, 328.65520065520064], [3875.0, 310.3511673151751], [3907.0, 275.4267664950863], [3971.0, 252.0], [4035.0, 355.45350649350655], [4067.0, 202.01168451801334], [4102.0, 256.0], [4166.0, 170.3178534571722], [4294.0, 181.05092869982025], [4422.0, 98.90077519379857], [4486.0, 351.46857597454243], [4614.0, 369.11677479147335], [4678.0, 249.51970802919695], [4742.0, 238.0], [4806.0, 518.9135802469136], [4870.0, 612.0], [4998.0, 219.80766096169515], [5062.0, 253.16036655211855], [4934.0, 1254.0], [5126.0, 265.50909090909084], [5254.0, 198.69259259259263], [5382.0, 467.8333333333333], [5446.0, 97.70415360501556], [5574.0, 1241.0], [5638.0, 280.89423076923117], [5702.0, 182.5645161290325], [5894.0, 228.27015793848676], [5958.0, 693.6712328767118], [6150.0, 201.94590163934436], [6278.0, 312.1867219917013], [6342.0, 601.6382513661189], [6214.0, 1228.0], [6534.0, 707.8926829268298], [6662.0, 488.0], [6790.0, 313.48643761302], [6854.0, 500.0], [6726.0, 1217.0], [7046.0, 122.73776223776217], [7110.0, 1794.0], [6982.0, 1057.0], [6918.0, 1215.0], [7302.0, 281.4613810741688], [7366.0, 164.1097560975609], [7174.0, 1051.25], [7430.0, 467.09970238095207], [7622.0, 267.57965860597426], [7558.0, 1044.0], [7686.0, 715.0723404255326], [7750.0, 563.4146981627292], [7814.0, 368.8594741613784], [7878.0, 382.79231337767965], [7942.0, 469.6567481402767], [8006.0, 583.922010398613], [8134.0, 403.9073869900774], [8204.0, 506.89266547406163], [8332.0, 946.5486968449941], [8460.0, 1027.0], [8716.0, 793.25], [8844.0, 827.100547195623], [8972.0, 244.54249547920426], [9100.0, 1621.0], [9228.0, 298.54415954415947], [9740.0, 1068.7506887052332], [9868.0, 225.24077669902906], [9996.0, 439.1403225806449], [8207.0, 808.0], [8463.0, 1072.9166666666667], [8591.0, 376.4609164420482], [8719.0, 940.9989898989899], [9103.0, 1345.6666666666667], [8975.0, 1467.3333333333333], [9231.0, 777.3107113654945], [9359.0, 631.602635228848], [9487.0, 686.8333333333334], [9615.0, 1009.7142857142856], [9871.0, 279.8817480719794], [4167.0, 109.3477537437603], [4359.0, 219.27457627118656], [4487.0, 100.88738019169321], [4615.0, 261.7058823529414], [4679.0, 216.46752549651092], [4807.0, 119.10936799641418], [4871.0, 345.8], [4935.0, 625.0], [4999.0, 348.5818777292573], [5063.0, 1256.5], [5127.0, 190.03069367710242], [5191.0, 107.0], [5255.0, 300.57757437070956], [5319.0, 256.0722891566264], [5511.0, 557.4038277511961], [5575.0, 522.0], [5383.0, 1245.0], [5703.0, 150.38133725202076], [5767.0, 335.4156327543423], [5831.0, 1237.0], [5895.0, 552.0], [5959.0, 589.2171156893817], [6023.0, 391.8738621586476], [6215.0, 235.21448921448913], [6279.0, 551.0], [6343.0, 1226.0], [6407.0, 699.9173693086002], [6535.0, 227.145446096654], [6599.0, 1220.0], [6471.0, 1223.0], [6663.0, 527.1285714285715], [6791.0, 150.68238993710708], [6855.0, 645.1015037593986], [6727.0, 1218.0], [6919.0, 267.34472727272714], [6983.0, 1058.0], [7175.0, 258.0924024640655], [7367.0, 38.0], [7431.0, 440.6573295985058], [7495.0, 198.5576456310683], [7559.0, 848.5253807106595], [7751.0, 192.39173228346445], [7815.0, 559.372462488968], [7879.0, 127.31360946745565], [7943.0, 586.8055162659116], [8007.0, 92.27065111758985], [8071.0, 257.7043478260869], [8135.0, 150.66419612314692], [8462.0, 980.3189312109154], [8590.0, 316.7053364269139], [9102.0, 1306.2671875], [8846.0, 1017.4], [9358.0, 655.33449074074], [9486.0, 560.2578906851408], [9614.0, 564.9619341563795], [9230.0, 586.0209973753285], [9742.0, 415.0], [8209.0, 542.8950729927016], [8337.0, 271.35859030836997], [8465.0, 1074.7142857142856], [8593.0, 2385.0], [8849.0, 297.5240912933224], [8977.0, 368.37171244886025], [9105.0, 2044.378424657533], [8721.0, 1020.0], [9233.0, 596.8823529411765], [9489.0, 1063.4780219780207], [9617.0, 423.68911917098455], [9361.0, 412.3333333333333], [9745.0, 115.83265856950038], [9873.0, 1432.5], [513.0, 51.90402476780188], [537.0, 1160.0], [529.0, 10.555288461538465], [521.0, 0.8800000000000002], [545.0, 69.0], [569.0, 65.32296650717704], [561.0, 20.668965517241375], [553.0, 73.0], [577.0, 55.9135638297873], [601.0, 11.423529411764706], [593.0, 284.75], [585.0, 896.0], [609.0, 30.357142857142872], [633.0, 0.8387096774193548], [625.0, 33.889062500000016], [617.0, 52.89351851851855], [641.0, 51.518024032042725], [665.0, 50.35321100917433], [657.0, 33.89167897587387], [649.0, 21.722987672226274], [673.0, 17.847619047619048], [689.0, 34.64115646258515], [697.0, 56.24062499999996], [681.0, 24.52916073968704], [705.0, 49.75387263339072], [729.0, 35.11774002370608], [721.0, 30.83085896076357], [713.0, 20.074402125775016], [737.0, 53.16030534351145], [761.0, 15.48732943469785], [753.0, 17.758449304174935], [745.0, 29.580645161290324], [769.0, 15.351524879614763], [785.0, 19.79425837320575], [777.0, 67.90319457889649], [793.0, 888.0], [801.0, 61.48275862068966], [817.0, 52.60185185185185], [809.0, 27.021831412977605], [833.0, 2.565217391304348], [857.0, 69.13934426229511], [849.0, 63.30573248407643], [841.0, 49.411458333333336], [889.0, 61.86206896551724], [881.0, 20.910891089108908], [873.0, 51.0306435137896], [865.0, 885.0], [897.0, 280.25], [921.0, 1.7730263157894743], [913.0, 20.443609022556394], [905.0, 883.0], [929.0, 55.58849280800499], [953.0, 2.9374999999999996], [945.0, 58.35254491017961], [937.0, 59.528120713305896], [961.0, 117.47119078105005], [985.0, 63.30952380952378], [977.0, 63.97701149425288], [969.0, 60.091911764705934], [993.0, 0.8461538461538461], [1017.0, 49.73723723723721], [1009.0, 63.93029953917038], [1001.0, 31.754263565891367], [1026.0, 56.56152125279624], [1074.0, 81.2142857142857], [1058.0, 27.184729064039438], [1042.0, 41.0365358592693], [1090.0, 57.8050847457627], [1138.0, 57.03322259136217], [1122.0, 76.83333333333333], [1106.0, 70.27237354085601], [1154.0, 60.03611293499673], [1202.0, 51.33037694013301], [1170.0, 23.31967213114753], [1186.0, 874.0], [1218.0, 55.6774193548387], [1266.0, 77.5], [1234.0, 57.634615384615365], [1250.0, 872.0], [1282.0, 49.04659498207885], [1330.0, 67.95994277539349], [1314.0, 26.340136054421762], [1298.0, 80.01159047005787], [1346.0, 49.6], [1394.0, 55.51890756302522], [1378.0, 7.146938775510202], [1362.0, 30.010736196318998], [1410.0, 474.0], [1442.0, 77.76210705182658], [1426.0, 51.948460987831076], [1474.0, 79.36553191489388], [1522.0, 101.00304259634895], [1506.0, 4.2255639097744355], [1490.0, 84.0], [1538.0, 104.81730769230774], [1586.0, 6.612736660929432], [1570.0, 68.23971631205671], [1554.0, 97.4361532322427], [1602.0, 99.90862944162443], [1650.0, 61.9339207048458], [1634.0, 79.03333333333315], [1618.0, 122.08880308880312], [1666.0, 5.569277108433738], [1714.0, 65.87994350282499], [1698.0, 71.84794851166541], [1682.0, 86.69810085134236], [1730.0, 49.15151515151516], [1778.0, 114.68258426966287], [1842.0, 125.74663072776279], [1810.0, 126.0630769230769], [1826.0, 100.54055587067509], [1794.0, 854.0], [1858.0, 55.39150943396232], [1874.0, 104.18604651162788], [1890.0, 63.857018308631254], [1906.0, 54.35474006116203], [1970.0, 160.7925170068027], [1938.0, 6.0], [1954.0, 104.86816720257235], [1922.0, 850.0], [1986.0, 48.46666666666666], [2034.0, 414.5032679738563], [2002.0, 195.57142857142856], [2018.0, 847.0], [2052.0, 356.7450980392157], [2084.0, 212.38788870703758], [2116.0, 73.40652654867253], [2148.0, 286.0], [2276.0, 95.0], [2180.0, 132.8235294117647], [2244.0, 240.28571428571433], [2308.0, 137.77858439201458], [2340.0, 171.04744525547454], [2372.0, 62.3333333333333], [2468.0, 112.8371266002844], [2500.0, 112.93845252051584], [2532.0, 828.3333333333334], [2628.0, 141.15978098556522], [2660.0, 167.63338088445042], [2564.0, 828.0], [2788.0, 140.74717285945056], [2724.0, 433.66666666666663], [2820.0, 182.25547445255464], [2852.0, 151.0], [2916.0, 849.0], [3044.0, 76.66666666666667], [2948.0, 116.45301757066458], [2980.0, 175.75256916996045], [3012.0, 175.5200000000001], [3140.0, 90.0364372469635], [3172.0, 142.21287128712865], [3204.0, 207.84862692565318], [3268.0, 244.5], [3332.0, 246.21188630490997], [3364.0, 209.79519774011297], [3396.0, 246.0], [3460.0, 142.56554307116102], [3492.0, 260.4402173913046], [3556.0, 410.0], [3684.0, 216.07464212678926], [3652.0, 206.3195004029007], [3588.0, 1067.5], [3716.0, 409.0], [3780.0, 276.26480263157924], [3812.0, 317.0370370370365], [3908.0, 271.1896551724136], [3940.0, 165.7135389440668], [3972.0, 176.2079365079365], [4068.0, 89.80182232346239], [4104.0, 281.80794701986747], [4232.0, 127.8675721561969], [4360.0, 250.92307692307736], [4424.0, 236.0], [4552.0, 513.8138385502484], [4744.0, 425.0], [4872.0, 446.7763541059992], [4936.0, 532.6956521739136], [5000.0, 455.18009478673], [5064.0, 4.0], [5128.0, 228.1357340720222], [5192.0, 168.33790613718418], [5320.0, 226.7641662169456], [5512.0, 460.74068441064645], [5576.0, 1241.0], [5384.0, 1244.0], [5640.0, 868.0], [5704.0, 282.4597701149424], [5768.0, 379.5942782834848], [5896.0, 552.0], [6024.0, 535.4790486976218], [6088.0, 208.45264691597865], [5960.0, 1236.0], [6152.0, 655.6666666666667], [6216.0, 123.5], [6408.0, 712.1199736321676], [6600.0, 495.9009230769216], [6472.0, 1223.0], [6664.0, 364.9921913128354], [6856.0, 687.5869380831211], [6920.0, 307.57884615384665], [6984.0, 833.1158690176318], [7048.0, 397.93011750154625], [7112.0, 385.1470869149949], [7176.0, 315.4362336114422], [7304.0, 524.0], [7368.0, 1048.0], [7496.0, 218.13978494623655], [7560.0, 659.4094594594584], [7624.0, 442.0], [7816.0, 844.25], [7752.0, 1040.25], [7688.0, 1041.0], [7944.0, 792.0], [8008.0, 197.0], [8072.0, 36.76035031847127], [8136.0, 223.0], [8208.0, 700.4290962527547], [8336.0, 213.20668693009122], [8592.0, 777.0], [8464.0, 1027.25], [8720.0, 966.5682326621939], [8848.0, 222.54012079378788], [8976.0, 1013.0], [9232.0, 899.5848837209303], [9360.0, 970.0], [9744.0, 937.7513227513227], [9872.0, 325.16166134185335], [10000.0, 607.4141877319882], [8467.0, 886.9349470499274], [8595.0, 483.4535040431265], [8723.0, 1072.6842105263158], [8851.0, 1017.1428571428572], [9235.0, 1010.0], [9363.0, 1214.338012958962], [9491.0, 227.0], [9619.0, 863.856219709207], [9747.0, 155.5], [9875.0, 657.8434782608691], [4105.0, 180.05590062111818], [4169.0, 189.14285714285714], [4233.0, 108.32962962962971], [4297.0, 361.4515648286139], [4425.0, 188.81474480151223], [4553.0, 159.31245225362878], [4745.0, 202.3930300096806], [4809.0, 167.33333333333334], [4873.0, 192.75914634146338], [4937.0, 494.99790209790234], [5065.0, 101.66559070367957], [5193.0, 143.66577777777778], [5321.0, 293.42241379310383], [5385.0, 388.48912097476085], [5449.0, 278.5562913907286], [5513.0, 1019.6], [5577.0, 460.436507936508], [5641.0, 377.4972222222226], [5769.0, 775.0], [5833.0, 191.81804123711348], [6025.0, 671.0], [6089.0, 195.53919694072658], [5961.0, 1235.0], [5897.0, 1236.0], [6153.0, 384.83841463414626], [6281.0, 385.376947040498], [6345.0, 677.0], [6217.0, 1228.5], [6473.0, 202.4994425863993], [6601.0, 136.69047619047637], [6665.0, 358.6737967914439], [6729.0, 506.5772058823529], [6857.0, 1216.0], [6793.0, 1217.0], [6985.0, 266.62565905096614], [7049.0, 78.25142857142862], [7113.0, 187.9981060606061], [7241.0, 428.15252621544363], [7369.0, 1047.5], [7433.0, 755.75], [7625.0, 488.65420560747685], [7689.0, 821.0636942675163], [7817.0, 1039.0], [7753.0, 1040.0], [8073.0, 27.116071428571434], [8210.0, 767.0], [8594.0, 477.8092105263171], [8466.0, 1027.0], [8338.0, 1030.0], [8978.0, 437.00647249190905], [9106.0, 1108.7726027397264], [8722.0, 1019.625], [9490.0, 937.6240814019219], [9618.0, 552.0361990950229], [9362.0, 442.0], [9234.0, 521.8], [9746.0, 118.69921874999996], [8213.0, 93.98643714136662], [8341.0, 477.91375545851537], [8469.0, 1027.0], [8725.0, 211.0426871938417], [8853.0, 496.8558139534886], [8981.0, 629.7296538821337], [9109.0, 925.4827586206897], [9237.0, 182.85540069686405], [9621.0, 968.0], [9749.0, 204.12766903914604], [9877.0, 801.5113043478267], [2053.0, 57.342599549211116], [2149.0, 71.94488188976375], [2085.0, 157.05513307984796], [2117.0, 128.8108108108108], [2277.0, 95.57670329670337], [2181.0, 251.0], [2213.0, 158.1707891637222], [2245.0, 1.0], [2309.0, 130.8545454545455], [2341.0, 151.1959798994976], [2373.0, 78.14492753623183], [2533.0, 160.6400966183576], [2437.0, 655.0], [2469.0, 238.0], [2501.0, 148.39603960396042], [2661.0, 119.62273476112009], [2597.0, 827.0], [2565.0, 826.0], [2693.0, 148.18841201716714], [2789.0, 319.25], [2917.0, 650.3333333333334], [2821.0, 125.8143222506392], [2853.0, 159.68967334035835], [2885.0, 188.589953271028], [2981.0, 153.41728212703106], [3013.0, 140.99359720605372], [3045.0, 122.30456852791868], [2949.0, 849.75], [3077.0, 46.87297297297296], [3141.0, 245.0], [3205.0, 152.5755467196818], [3237.0, 207.05391394504912], [3269.0, 204.17253521126761], [3429.0, 395.0], [3333.0, 181.28676470588252], [3365.0, 190.5366774541531], [3397.0, 233.1766109785204], [3557.0, 407.51086956521726], [3525.0, 91.09334126040419], [3685.0, 174.7910142954391], [3717.0, 405.0030234315946], [3813.0, 329.4281609195402], [3845.0, 145.55886524822674], [3941.0, 102.2950138504155], [3973.0, 285.5643086816715], [4005.0, 278.7478813559322], [4106.0, 298.58124999999995], [4298.0, 124.53435804701621], [4362.0, 500.0833333333333], [4426.0, 312.61878172588814], [4554.0, 240.0], [4618.0, 409.8935672514623], [4746.0, 235.55877976190482], [4810.0, 594.6666666666667], [4938.0, 145.30163934426224], [5066.0, 12.59483526268922], [5002.0, 1253.0], [4874.0, 1254.0], [5322.0, 1245.75], [5194.0, 1248.0], [5386.0, 640.0], [5450.0, 311.0281096275476], [5578.0, 122.75465838509314], [5514.0, 1242.0], [5642.0, 460.305439330544], [5706.0, 518.0], [5834.0, 200.88391038696537], [5898.0, 518.9243243243244], [6090.0, 379.0], [6026.0, 1233.75], [6154.0, 491.3940236275187], [6218.0, 226.3544303797469], [6282.0, 420.9324324324325], [6346.0, 284.7114754098359], [6474.0, 296.870031545741], [6538.0, 245.5], [6666.0, 750.0], [6730.0, 518.6137931034485], [6794.0, 213.26044568245135], [6922.0, 496.0], [6986.0, 397.5], [7114.0, 95.5], [7050.0, 1055.2857142857142], [7242.0, 194.37786774628918], [7306.0, 415.17506631299767], [7370.0, 198.99073537927066], [7434.0, 785.8950131233596], [7626.0, 396.99413145539916], [7690.0, 459.74536256323785], [7882.0, 360.2289156626506], [7946.0, 817.0], [8010.0, 294.9442148760332], [8074.0, 176.0], [8138.0, 1033.0], [8212.0, 95.34042553191489], [8340.0, 498.79065040650465], [8468.0, 215.74570135746612], [8596.0, 875.0], [8724.0, 356.28280773143433], [8852.0, 617.3502202643169], [8980.0, 1693.5], [9236.0, 1017.5895258315651], [9364.0, 454.11248073959877], [9492.0, 316.0], [9620.0, 423.0], [9748.0, 177.87817258883246], [9876.0, 708.0181219110393], [8215.0, 631.0], [8343.0, 513.8], [8599.0, 157.5054466230937], [8471.0, 1027.0], [9111.0, 368.5446096654272], [9495.0, 249.1733449477355], [9623.0, 1172.5052219321153], [9239.0, 486.5], [9879.0, 1807.4], [9751.0, 2322.0], [4171.0, 236.8298302344384], [4299.0, 90.27118644067797], [4363.0, 377.92439372325225], [4491.0, 234.7214710654405], [4619.0, 141.05985686402113], [4683.0, 502.952727272727], [4811.0, 327.6876240900064], [4747.0, 1256.0], [5003.0, 381.45918367346957], [5067.0, 856.6666666666666], [5131.0, 562.738868832732], [5259.0, 396.9105431309904], [5323.0, 1245.0], [5195.0, 1248.0], [5451.0, 509.59070464767643], [5515.0, 1242.0], [5707.0, 441.71264807030946], [5771.0, 411.82634730538905], [5835.0, 363.0], [5899.0, 536.0285714285712], [5963.0, 215.38346456692872], [6027.0, 1234.0], [6155.0, 631.0], [6219.0, 295.6490787269679], [6347.0, 134.19626639757843], [6475.0, 497.0], [6539.0, 201.0557749259629], [6603.0, 237.0], [6667.0, 620.5], [6731.0, 759.0], [6795.0, 369.83262583383856], [6923.0, 577.4292237442933], [7051.0, 97.0033333333333], [7243.0, 161.0], [7307.0, 222.9341772151899], [7371.0, 248.9033877038894], [7435.0, 540.5249597423503], [7499.0, 550.1894463667812], [7563.0, 256.0], [7691.0, 155.20603907637664], [7755.0, 313.1484962406016], [7819.0, 824.5261239368166], [7883.0, 245.25153643546946], [7947.0, 676.3109504132229], [8011.0, 289.07767995857046], [8075.0, 113.48672883787658], [8139.0, 308.36769327467], [8214.0, 106.38039215686275], [8342.0, 616.6274509803919], [8470.0, 263.0], [8598.0, 645.3920367534454], [8854.0, 1919.0], [8982.0, 733.5265374894686], [9110.0, 294.3766430738126], [9238.0, 388.5], [9494.0, 174.12006079027384], [9622.0, 1121.0519480519476], [9750.0, 286.9559471365639], [9878.0, 2158.0], [8217.0, 406.8520379676165], [8345.0, 904.4854932301739], [8473.0, 296.09348441926335], [8729.0, 488.91955307262555], [8857.0, 415.3020833333331], [8985.0, 1004.990196078432], [9241.0, 360.3891377379626], [9369.0, 325.01483679525205], [9753.0, 598.1166484118288], [9881.0, 1025.2901146131815], [1027.0, 19.54838709677418], [1075.0, 30.206896551724178], [1059.0, 5.0], [1043.0, 21.077235772357753], [1091.0, 51.88096935139002], [1139.0, 62.849258649093926], [1123.0, 48.500573175391686], [1107.0, 45.34583014537109], [1155.0, 79.40465116279061], [1187.0, 77.23809523809524], [1203.0, 873.0], [1219.0, 48.44843749999994], [1267.0, 46.04679802955665], [1251.0, 63.66053921568625], [1235.0, 60.71606118546854], [1283.0, 22.069264069264076], [1331.0, 25.575826681869987], [1299.0, 67.86519607843148], [1379.0, 81.49256198347103], [1395.0, 66.6201201201201], [1363.0, 21.25], [1459.0, 58.36123348017623], [1411.0, 474.5], [1443.0, 84.08950086058526], [1475.0, 289.3333333333333], [1523.0, 52.52955974842768], [1507.0, 78.45556209535034], [1491.0, 56.904761904761905], [1539.0, 94.85815602836878], [1587.0, 4.583333333333334], [1571.0, 75.40464344941961], [1603.0, 5.28125], [1651.0, 69.1502866502866], [1635.0, 78.0], [1619.0, 6.333333333333333], [1667.0, 22.33704735376044], [1715.0, 98.34297242770661], [1699.0, 77.30734966592428], [1683.0, 100.26609442060088], [1731.0, 74.76454420522239], [1779.0, 128.25000000000006], [1763.0, 44.88196721311475], [1747.0, 68.53962264150948], [1795.0, 4.2941176470588225], [1843.0, 116.41721854304635], [1811.0, 52.922077922077946], [1827.0, 84.72271714922033], [1907.0, 85.48551724137927], [1859.0, 90.7201625190451], [1875.0, 112.55596330275228], [1891.0, 104.86046511627913], [1923.0, 61.992366412213805], [1939.0, 79.68413978494632], [1955.0, 180.90592334494772], [1971.0, 9.44444444444444], [1987.0, 22.525000000000002], [2003.0, 4.631782945736435], [2019.0, 82.07894736842105], [2035.0, 428.1350762527232], [2086.0, 80.85488958990533], [2118.0, 175.72670807453434], [2150.0, 98.93400549954166], [2214.0, 134.84763948497857], [2246.0, 214.25], [2278.0, 137.3412698412699], [2182.0, 842.0], [2310.0, 33.01256983240223], [2342.0, 103.0], [2374.0, 197.86068855084073], [2406.0, 147.56614246068452], [2534.0, 108.04309392265188], [2438.0, 832.5], [2566.0, 201.4809917355371], [2662.0, 824.0], [2694.0, 103.98316498316498], [2726.0, 170.54159445407248], [2790.0, 823.0], [2918.0, 206.37573964497045], [2854.0, 150.68428571428564], [2886.0, 132.2936630602786], [2822.0, 833.0], [3046.0, 82.1390070921986], [3014.0, 102.75357142857142], [3078.0, 160.60593220339], [3174.0, 108.0], [3238.0, 116.99512195121952], [3270.0, 182.38102189781023], [3302.0, 296.0], [3430.0, 331.15909090909105], [3398.0, 197.08798972382792], [3462.0, 174.0], [3558.0, 297.2578849721704], [3494.0, 506.0], [3526.0, 154.91122448979607], [3590.0, 264.7882352941177], [3654.0, 382.0], [3718.0, 214.0237467018468], [3750.0, 174.9936842105262], [3814.0, 247.0], [3942.0, 232.0], [3846.0, 210.74837310195235], [4006.0, 285.36914165350225], [4236.0, 291.6334745762712], [4300.0, 123.0], [4364.0, 258.25080385852124], [4492.0, 403.4851657940666], [4684.0, 339.8760792280348], [4812.0, 352.8429487179491], [4620.0, 1261.0], [4876.0, 216.908777969019], [5004.0, 266.357435197817], [5068.0, 106.49900199600799], [5132.0, 349.3284477015326], [5196.0, 335.952595936795], [5260.0, 126.52118644067804], [5324.0, 347.08718395815174], [5452.0, 656.5], [5516.0, 184.61630695443642], [5580.0, 188.33333333333334], [5644.0, 429.0], [5772.0, 123.61437632135296], [5836.0, 1237.0], [5900.0, 514.2858695652166], [5964.0, 283.54444444444476], [6028.0, 421.40574632095274], [6092.0, 468.2322713257968], [6220.0, 380.93977154724826], [6348.0, 831.0], [6284.0, 1227.0], [6156.0, 1229.5], [6412.0, 264.3999999999999], [6540.0, 318.85157699443386], [6604.0, 258.1081081081081], [6668.0, 636.3510285335112], [6860.0, 334.1316176470589], [6924.0, 727.7349097697559], [7052.0, 50.79419889502758], [7116.0, 308.2102461743189], [6988.0, 1058.0], [7180.0, 575.642580645161], [7308.0, 95.0], [7244.0, 1050.3333333333333], [7436.0, 171.15151515151524], [7500.0, 564.881291547958], [7564.0, 257.0549450549448], [7628.0, 1727.0], [7756.0, 325.0559006211179], [7820.0, 852.8229426433916], [7948.0, 540.8502170766988], [8012.0, 976.8999999999999], [8076.0, 625.4], [8140.0, 323.1997677119629], [8216.0, 398.30677290836655], [8472.0, 222.5472238122496], [8728.0, 415.9458333333333], [8856.0, 689.5570054945065], [9240.0, 177.69404517453813], [9368.0, 190.95663956639567], [9624.0, 1149.8060941828262], [9752.0, 425.3673469387755], [9880.0, 1062.3078358208943], [8219.0, 842.5], [8347.0, 886.5], [8603.0, 199.15229357798162], [8987.0, 178.8135048231511], [9115.0, 741.6252518468759], [9499.0, 356.5390487375224], [9627.0, 1256.0299823633159], [9371.0, 438.0], [9243.0, 598.0], [9883.0, 1423.4444444444443], [4109.0, 196.2857142857142], [4237.0, 284.63152559553964], [4365.0, 115.68292682926824], [4557.0, 291.4359605911328], [4621.0, 162.0], [4685.0, 164.5567010309279], [4749.0, 410.30922242314665], [4877.0, 240.61122661122664], [4941.0, 923.1666666666666], [5069.0, 65.72530009233603], [5005.0, 1252.75], [5197.0, 390.9203747072595], [5261.0, 235.0], [5325.0, 337.254054054054], [5389.0, 619.9209572153736], [5453.0, 656.0], [5517.0, 181.4840579710142], [5581.0, 757.5], [5709.0, 684.875], [5837.0, 391.65882352941173], [5645.0, 1240.0], [6029.0, 543.8888888888891], [6093.0, 441.00296735905056], [5965.0, 1236.0], [5901.0, 1237.5], [6221.0, 662.0], [6285.0, 221.62278106508873], [6413.0, 109.4165464165463], [6605.0, 223.35768374164778], [6541.0, 1222.0], [6477.0, 1222.0], [6669.0, 133.4269230769231], [6733.0, 581.5157384987898], [6861.0, 150.0113808801214], [6989.0, 204.8184300341297], [7053.0, 78.58415841584159], [7117.0, 361.127792672029], [6925.0, 1215.0], [7181.0, 828.503526093089], [7245.0, 186.51734104046238], [7309.0, 931.5], [7373.0, 204.0], [7565.0, 209.95655737704936], [7629.0, 849.8571428571429], [7437.0, 1045.5], [7821.0, 264.0], [8013.0, 450.0], [8077.0, 768.5], [8141.0, 839.0], [8218.0, 567.5559105431304], [8346.0, 875.8985890652558], [8474.0, 1029.0], [8730.0, 614.4347826086956], [8858.0, 645.375], [8986.0, 515.5278969957076], [9114.0, 575.766850828729], [9242.0, 502.0], [9370.0, 58.0], [9498.0, 336.34256559766754], [9882.0, 1351.2608695652177], [9754.0, 1107.7272727272727], [8221.0, 584.2131147540979], [8477.0, 583.7085385878495], [8733.0, 703.129650507328], [8861.0, 812.3037499999999], [9117.0, 609.0], [8989.0, 1012.0], [9245.0, 670.2920930232551], [9373.0, 530.6639418710265], [9629.0, 152.26229508196732], [9501.0, 433.0], [9757.0, 712.0736377025029], [9885.0, 1180.3590534979419], [2151.0, 195.39682539682536], [2055.0, 300.33333333333337], [2119.0, 146.92403846153832], [2087.0, 846.0], [2183.0, 137.80119760479047], [2279.0, 41.35820895522389], [2215.0, 241.0], [2247.0, 122.00447427293066], [2311.0, 69.3578125], [2343.0, 55.696969696969674], [2375.0, 91.0], [2407.0, 97.36020473448512], [2439.0, 157.70185962807432], [2471.0, 156.6867321867324], [2567.0, 121.29665314401632], [2599.0, 164.9384878257157], [2631.0, 206.66804979253115], [2663.0, 825.0], [2791.0, 195.39788732394373], [2727.0, 113.86643835616435], [2759.0, 158.7260273972601], [2887.0, 142.07669616519178], [2919.0, 144.37081005586592], [3047.0, 304.3333333333333], [2983.0, 400.0], [3175.0, 207.4359464627151], [3079.0, 162.428217821782], [3111.0, 185.23011015911868], [3143.0, 167.44963738920237], [3303.0, 246.63503649635024], [3207.0, 154.5], [3271.0, 123.28112449799201], [3367.0, 247.0], [3399.0, 122.077504725898], [3431.0, 284.52473958333263], [3463.0, 204.7371663244352], [3495.0, 528.0], [3527.0, 401.0], [3559.0, 263.0850785340316], [3591.0, 222.6461038961037], [3623.0, 185.6046650717703], [3687.0, 269.0], [3751.0, 97.43750000000014], [3783.0, 230.5727272727273], [3879.0, 222.26956521739106], [3911.0, 281.74069478908166], [3975.0, 472.46153846153845], [4039.0, 258.1099796334011], [4071.0, 282.2409717662505], [4110.0, 126.6793893129771], [4302.0, 203.03256936067558], [4366.0, 226.0], [4430.0, 290.77558441558375], [4558.0, 384.356801093643], [4622.0, 261.0], [4750.0, 173.7523461939517], [4942.0, 293.09934924078135], [5070.0, 764.0], [5006.0, 1253.0], [5198.0, 391.0598290598287], [5262.0, 170.5], [5390.0, 159.7366666666667], [5454.0, 678.2115384615387], [5518.0, 343.6666666666667], [5582.0, 219.3432289548596], [5646.0, 308.67861609003694], [5838.0, 399.1784975878704], [5902.0, 1040.2], [6158.0, 210.64493221433187], [6222.0, 662.0], [6286.0, 92.1980033277871], [6478.0, 664.545161290323], [6606.0, 316.78294573643416], [6542.0, 1221.0], [6414.0, 1224.0], [6670.0, 219.0], [6734.0, 294.95487984306067], [6862.0, 240.0], [6798.0, 1217.0], [6990.0, 301.9577167019023], [6926.0, 1215.0], [7246.0, 254.6551373346898], [7310.0, 785.762622456669], [7374.0, 541.9650817236255], [7566.0, 706.4], [7630.0, 615.5846488840497], [7694.0, 228.89462592202327], [7886.0, 1038.0], [8014.0, 538.9232283464567], [8078.0, 227.64451410658347], [8476.0, 554.8108356290188], [8604.0, 401.9120521172636], [8860.0, 1011.4276527331185], [9116.0, 665.8], [9372.0, 345.79899916597196], [9500.0, 400.8028169014084], [9628.0, 270.3725112395629], [8223.0, 715.8181818181818], [8351.0, 108.10396039603968], [8607.0, 343.23947895791576], [8991.0, 325.311698717949], [9119.0, 818.8139072847678], [8863.0, 1015.0], [8735.0, 1019.0], [9247.0, 712.6666666666666], [9503.0, 761.3065292096215], [9759.0, 996.5], [4175.0, 392.0234604105572], [4303.0, 290.47663551401894], [4367.0, 111.0], [4431.0, 103.63917525773195], [4495.0, 476.8518518518517], [4623.0, 223.75010883761445], [4751.0, 100.85964912280703], [4815.0, 499.2521008403361], [4687.0, 1260.0], [4943.0, 510.0], [5007.0, 287.44827586206895], [5135.0, 759.0], [5199.0, 622.3333333333334], [5391.0, 163.31249999999997], [5455.0, 695.0319218241038], [5583.0, 1241.0], [5647.0, 148.91935483870978], [5711.0, 168.4571746384874], [5775.0, 805.5], [5839.0, 427.3264705882354], [5967.0, 314.0448717948714], [6031.0, 1235.0], [5903.0, 1236.0], [6159.0, 143.95164233576648], [6287.0, 202.0], [6223.0, 1228.0], [6479.0, 701.7605396290041], [6543.0, 375.58725761772814], [6735.0, 119.3981481481481], [6799.0, 528.8227272727273], [6671.0, 1218.0], [6991.0, 596.2], [7055.0, 101.19522365428362], [6927.0, 1215.0], [7183.0, 924.5], [7247.0, 294.8064516129032], [7311.0, 366.8305369127528], [7375.0, 657.2481751824826], [7439.0, 218.210826210826], [7631.0, 775.6064516129035], [7567.0, 1043.5], [7695.0, 296.9343469246719], [7759.0, 531.3308411214955], [7887.0, 643.5667556742321], [8015.0, 660.4699357851723], [8079.0, 121.72858431018929], [8143.0, 775.9498381877021], [7951.0, 1037.0], [8222.0, 468.51768809167936], [8350.0, 138.0143810991271], [8606.0, 2044.0], [8478.0, 1027.5714285714287], [8734.0, 955.6947271045325], [8990.0, 180.22222222222246], [9118.0, 608.3333333333334], [8862.0, 1017.0], [9246.0, 683.968020743301], [9502.0, 558.5367647058827], [9630.0, 363.6666666666667], [9374.0, 436.5], [9758.0, 921.5377969762425], [9886.0, 365.9591695501731], [8225.0, 776.0], [8481.0, 955.7058823529412], [8865.0, 392.42382271468114], [9121.0, 440.0], [9377.0, 778.9588607594937], [9633.0, 580.9702687249859], [9249.0, 599.0], [9761.0, 625.7777777777778], [257.0, 5.018617021276596], [269.0, 12.668604651162788], [261.0, 6.215323645970953], [265.0, 5.117647058823533], [273.0, 6.336654804270474], [277.0, 28.162891046386243], [285.0, 14.180267062314543], [281.0, 119.10526315789474], [289.0, 10.239240506329113], [301.0, 19.326169405815445], [293.0, 16.23467230443974], [297.0, 20.011838006230484], [305.0, 23.693418940609995], [317.0, 19.203252032520325], [309.0, 23.794570135746618], [313.0, 6.049817739975698], [321.0, 10.005988023952101], [333.0, 6.8377298161470925], [325.0, 8.161144578313255], [329.0, 8.246065808297578], [337.0, 8.396515679442507], [341.0, 24.095785440613025], [349.0, 75.0], [345.0, 0.8], [353.0, 1.900332225913621], [357.0, 7.429553264604817], [365.0, 7.091388400702987], [361.0, 10.125598086124397], [369.0, 11.056420233463028], [381.0, 30.703860072376404], [373.0, 10.584692597239641], [377.0, 7.240101095197976], [385.0, 36.33175803402645], [389.0, 0.945945945945946], [397.0, 10.546232876712331], [393.0, 9.230769230769235], [401.0, 9.724696356275299], [413.0, 22.003883495145633], [405.0, 472.3333333333333], [409.0, 8.724094881398242], [417.0, 15.35329341317366], [421.0, 25.974690082644617], [425.0, 83.49560853199505], [429.0, 2240.0], [433.0, 846.0], [437.0, 68.0], [445.0, 561.4615384615385], [441.0, 69.5], [449.0, 12.645161290322578], [453.0, 8.926022628372516], [461.0, 0.8910505836575876], [457.0, 30.36713798147247], [465.0, 70.6], [477.0, 2251.0], [469.0, 1300.0], [481.0, 80.0], [493.0, 9.159883720930246], [489.0, 161.5], [485.0, 2250.0], [497.0, 9.220394736842106], [505.0, 59.31434184675836], [514.0, 51.217252396166145], [538.0, 50.517162471395906], [530.0, 98.0], [522.0, 39.72075471698113], [554.0, 55.36309523809527], [546.0, 31.844838118509422], [570.0, 39.00718993409238], [562.0, 895.0], [578.0, 16.215538847117774], [602.0, 6.271084337349398], [594.0, 44.66481334392371], [586.0, 43.131557035803525], [610.0, 13.07014925373134], [618.0, 17.4411149825784], [634.0, 56.80303030303027], [626.0, 22.27207637231504], [650.0, 13.377207062600334], [642.0, 14.523809523809524], [666.0, 25.142617449664446], [658.0, 14.61517241379309], [674.0, 0.8936170212765958], [682.0, 136.1818181818182], [690.0, 17.25133689839572], [698.0, 16.003968253968253], [706.0, 37.79166666666666], [714.0, 20.86563307493539], [730.0, 17.309523809523803], [722.0, 16.747596153846146], [738.0, 16.357650096836664], [746.0, 10.166666666666666], [762.0, 69.0], [754.0, 51.09876543209882], [770.0, 3.8510638297872353], [778.0, 29.06840891621831], [794.0, 55.38248847926266], [826.0, 59.51020408163264], [818.0, 111.29661016949146], [810.0, 16.109589041095894], [834.0, 55.56151419558352], [842.0, 11.642857142857144], [858.0, 64.18876404494384], [850.0, 17.349534643226466], [866.0, 84.60000000000001], [874.0, 52.62039660056655], [890.0, 98.25470430107512], [882.0, 96.0], [898.0, 51.74107142857136], [922.0, 0.90547263681592], [906.0, 884.0], [938.0, 40.839321357285364], [930.0, 18.993083003952556], [954.0, 78.90222222222216], [946.0, 68.46341463414635], [970.0, 46.55837811431367], [962.0, 85.75104166666667], [986.0, 27.8813559322034], [978.0, 65.16783216783219], [994.0, 88.82], [1002.0, 31.0], [1018.0, 21.08544726301735], [1010.0, 18.132933104631256], [1076.0, 9.466124661246617], [1044.0, 879.0], [1092.0, 23.91393442622951], [1140.0, 45.09446254071659], [1124.0, 24.474137931034488], [1108.0, 26.11671087533158], [1156.0, 24.42622950819672], [1204.0, 88.30104923325261], [1188.0, 59.34538411878629], [1172.0, 58.61663286004048], [1268.0, 60.88797061524335], [1252.0, 89.06930693069302], [1236.0, 49.33647058823525], [1284.0, 1.0], [1300.0, 24.919014084507037], [1316.0, 6.724137931034486], [1332.0, 869.0], [1348.0, 56.4047965116279], [1364.0, 57.252361673414356], [1396.0, 56.68123393316195], [1380.0, 64.1252653927812], [1428.0, 62.10741687979537], [1412.0, 61.25542275343072], [1460.0, 68.29218106995886], [1444.0, 66.8245283018867], [1476.0, 31.58823529411765], [1492.0, 77.1077551020409], [1524.0, 483.5], [1508.0, 81.36714975845412], [1540.0, 31.848920863309363], [1556.0, 44.1064676616915], [1588.0, 72.50710545998497], [1572.0, 130.23487544483982], [1604.0, 54.86558044806511], [1620.0, 37.84126984126984], [1652.0, 107.8571428571429], [1636.0, 92.29480737018424], [1668.0, 106.0], [1716.0, 82.19262295081964], [1700.0, 857.0], [1684.0, 857.0], [1732.0, 144.140350877193], [1780.0, 72.85185185185183], [1764.0, 72.64148936170223], [1748.0, 78.51722756410261], [1796.0, 53.955334987593076], [1812.0, 68.18543046357627], [1844.0, 105.97826086956523], [1828.0, 89.62337662337659], [1860.0, 54.65442764578831], [1908.0, 124.41605839416057], [1876.0, 55.94], [1892.0, 105.8692152917505], [1924.0, 67.64009111617312], [1940.0, 2.595744680851064], [1972.0, 96.98897565457052], [1956.0, 77.26234906695937], [1988.0, 66.69626168224298], [2004.0, 104.06028741675436], [2036.0, 77.40614334470997], [2020.0, 26.53643724696357], [2056.0, 127.8790170132325], [2088.0, 89.95619047619046], [2152.0, 281.0], [2120.0, 843.0], [2184.0, 122.3165680473372], [2248.0, 182.80792682926844], [2280.0, 55.23423423423417], [2312.0, 121.57395644283086], [2344.0, 76.1730769230769], [2376.0, 91.94736842105263], [2440.0, 106.17368961973277], [2472.0, 109.53867557039499], [2504.0, 157.48099173553734], [2536.0, 831.0], [2600.0, 141.09848484848493], [2632.0, 127.37572493786253], [2664.0, 176.6608391608392], [2792.0, 157.76357615894025], [2728.0, 153.0], [2760.0, 116.84892086330932], [2696.0, 824.0], [2824.0, 262.0], [2920.0, 91.24611973392477], [2856.0, 653.5], [2952.0, 183.28373493975914], [2984.0, 174.89339697692904], [3048.0, 683.4868421052632], [3112.0, 163.41666666666666], [3144.0, 158.93506493506513], [3176.0, 182.23677826297916], [3240.0, 109.5], [3304.0, 197.7183544303797], [3464.0, 193.09090909090892], [3496.0, 163.23321554770337], [3528.0, 252.0], [3624.0, 175.69160997732428], [3656.0, 136.23167420814477], [3784.0, 196.64518574677788], [3848.0, 506.0], [3880.0, 211.40740740740736], [3912.0, 130.15141955835978], [3944.0, 229.6126126126126], [4040.0, 264.46843853820565], [4072.0, 382.44412607449834], [4176.0, 125.35392217418162], [4304.0, 310.7894736842104], [4368.0, 250.51666666666665], [4496.0, 197.29788135593242], [4560.0, 519.0], [4624.0, 410.1608040201004], [4816.0, 249.6586791350085], [4688.0, 1341.0], [4880.0, 880.0], [5008.0, 190.03334656609758], [5072.0, 208.31253223311], [5136.0, 179.74170274170268], [5264.0, 226.8892011240465], [5328.0, 656.3692307692304], [5200.0, 1248.0], [5456.0, 280.866310160428], [5520.0, 540.4616182572611], [5648.0, 1051.3333333333333], [5712.0, 97.25923645320202], [5776.0, 322.8118279569895], [5840.0, 1236.0], [5904.0, 215.7685916078102], [5968.0, 373.28859857482166], [6032.0, 244.34191919191917], [6096.0, 1232.5], [6160.0, 261.1666666666667], [6224.0, 686.871308016877], [6352.0, 232.0005549389571], [6288.0, 1227.0], [6544.0, 463.5927505330494], [6416.0, 1224.0], [6800.0, 715.4864396999421], [6864.0, 284.20629370629365], [6672.0, 1218.0], [6928.0, 746.3220720720724], [7120.0, 431.08459214501516], [7056.0, 1055.0], [7184.0, 817.0], [7312.0, 1048.3333333333333], [7248.0, 1050.0], [7440.0, 239.20580994583943], [7504.0, 772.6071695295001], [7568.0, 527.0503144654087], [7696.0, 476.0], [7760.0, 725.6324940047947], [7824.0, 225.54065040650414], [7888.0, 693.466380543634], [7952.0, 260.36707616707696], [8016.0, 885.0], [8144.0, 714.7582846003908], [8352.0, 180.0], [8608.0, 412.6937046004845], [8224.0, 1032.0], [8864.0, 280.13692307692327], [9120.0, 958.8785425101222], [9376.0, 658.7351460221558], [9504.0, 750.3907815631267], [9632.0, 761.1445221445222], [9248.0, 440.0], [8227.0, 177.0], [8355.0, 295.07969151670954], [8483.0, 1043.8], [8611.0, 540.3370944992954], [8739.0, 588.2246596066569], [8995.0, 547.530112508272], [9123.0, 1380.2950191570885], [8867.0, 1018.0], [9251.0, 1002.038034865292], [9507.0, 1050.8393782383428], [9635.0, 420.5], [9763.0, 1464.3390313390312], [9891.0, 338.47414965986366], [4113.0, 432.0], [4177.0, 143.0], [4241.0, 344.721174004193], [4369.0, 270.8868921775899], [4497.0, 99.36486486486486], [4625.0, 522.0], [4689.0, 234.5699958211448], [4753.0, 103.0], [4817.0, 120.30029154518944], [4881.0, 422.5665499124342], [5073.0, 166.3504761904762], [5137.0, 257.7735527809307], [5201.0, 286.4948571428571], [5265.0, 383.8723404255319], [5329.0, 106.58162393162402], [5457.0, 255.0], [5521.0, 343.5812407680943], [5713.0, 214.0], [5777.0, 439.43848167539255], [5841.0, 1236.75], [5649.0, 1240.0], [5905.0, 99.0], [5969.0, 20.0], [6033.0, 201.2450229709033], [6097.0, 268.7330847096426], [6161.0, 114.0], [6225.0, 627.157894736841], [6289.0, 254.43488509133743], [6353.0, 381.47320061255726], [6417.0, 342.2738448495117], [6481.0, 1005.0], [6545.0, 683.0], [6609.0, 418.5299600532623], [6673.0, 403.3522727272728], [6801.0, 726.347593582888], [6865.0, 294.88125613346347], [6929.0, 158.5539702233248], [6993.0, 625.2769230769223], [7057.0, 564.0], [7121.0, 552.8438818565386], [7185.0, 470.53228266395627], [7313.0, 770.6666666666666], [7249.0, 1050.0], [7505.0, 177.51929092805014], [7569.0, 514.3563856638063], [7633.0, 1727.0], [7441.0, 1045.0], [7761.0, 740.8571428571429], [7825.0, 203.797697368421], [7889.0, 1039.0], [7953.0, 191.55221238938051], [8081.0, 249.9560301507536], [8145.0, 910.0], [8017.0, 1034.0], [8226.0, 941.3023143683699], [8354.0, 249.76312419974408], [8482.0, 1018.7599486521183], [8610.0, 752.0], [8738.0, 1071.0292633703332], [8994.0, 397.0641711229944], [9250.0, 967.1755361397933], [9506.0, 432.0], [9762.0, 1161.1293451899753], [9890.0, 188.55797101449275], [8869.0, 542.0589519650654], [9125.0, 590.3478260869564], [8997.0, 1352.5], [9381.0, 938.9080932784657], [9509.0, 175.26771653543307], [9637.0, 729.673621460506], [9253.0, 599.0], [2057.0, 60.63258026159333], [2153.0, 81.65164835164829], [2089.0, 96.08485035482869], [2121.0, 99.17480314960619], [2281.0, 9.0], [2345.0, 125.18543046357608], [2377.0, 91.5223347230492], [2441.0, 240.0], [2505.0, 139.30138339920944], [2537.0, 185.23952879581142], [2665.0, 134.3193069306933], [2793.0, 112.82205513784463], [2761.0, 820.0], [2825.0, 170.55539906103323], [2921.0, 850.0], [2889.0, 817.5], [3049.0, 136.97974289053332], [2953.0, 111.21867881548968], [2985.0, 194.34976887519264], [3017.0, 221.73192111029942], [3081.0, 539.0], [3113.0, 244.0], [3209.0, 182.8855371900825], [3273.0, 239.0], [3305.0, 294.0], [3337.0, 172.92268041237116], [3369.0, 197.1744772891134], [3465.0, 191.92771084337335], [3497.0, 52.16738197424893], [3529.0, 381.9544041450771], [3561.0, 1078.0], [3657.0, 102.146771037182], [3689.0, 217.47740112994376], [3753.0, 307.0], [3785.0, 193.34611171960557], [3817.0, 184.44340723453936], [3945.0, 261.17173051519137], [3977.0, 243.70810810810832], [4114.0, 316.3283261802575], [4242.0, 113.95531724754251], [4370.0, 315.8980044345895], [4434.0, 193.79852125693162], [4562.0, 112.01385041551232], [4626.0, 631.6666666666667], [4754.0, 268.1878958479945], [4818.0, 181.0], [4882.0, 160.58486562942034], [4946.0, 352.4994974874376], [5010.0, 102.0], [5074.0, 1251.5], [5138.0, 255.9701492537314], [5202.0, 116.13926272674094], [5266.0, 433.0], [5330.0, 159.50537634408596], [5394.0, 280.64548494983285], [5522.0, 160.57017543859658], [5586.0, 553.0], [5458.0, 1243.0], [5714.0, 215.0], [5778.0, 568.0], [5842.0, 239.5016223231666], [6098.0, 369.73774509803934], [5970.0, 1235.0], [6162.0, 401.0], [6290.0, 308.207317073171], [6354.0, 649.2], [6482.0, 573.4307432432437], [6546.0, 762.0], [6610.0, 479.8468271334788], [6674.0, 293.38596491228077], [6738.0, 257.431654676259], [6802.0, 817.0], [6866.0, 502.0], [6994.0, 680.2422303473497], [7058.0, 179.34183396635848], [7186.0, 162.26691729323312], [7250.0, 453.8130909090908], [7314.0, 189.66871165644176], [7506.0, 1126.5714285714287], [7634.0, 212.50957854406118], [7826.0, 1038.0], [7954.0, 430.0], [8018.0, 1010.2], [8082.0, 333.55142503097903], [8146.0, 1033.0], [8356.0, 256.0], [8612.0, 540.5575396825393], [8484.0, 1027.5], [8228.0, 1032.0], [8740.0, 251.0], [8996.0, 749.0], [9124.0, 367.2003129890462], [9380.0, 1224.9320652173915], [9508.0, 893.563854047893], [9636.0, 1146.0], [9252.0, 399.5], [9892.0, 532.0], [9764.0, 413.6666666666667], [8231.0, 246.59935029778], [8359.0, 545.0530145530148], [8487.0, 187.1466789667901], [8615.0, 818.1710843373497], [8743.0, 250.41990521327037], [8999.0, 576.0321563682232], [9127.0, 630.2320916905447], [9255.0, 382.23508005822436], [9383.0, 756.6666666666667], [9767.0, 162.0048543689322], [9895.0, 372.17597911227205], [4115.0, 371.0167832167832], [4307.0, 360.9050683829452], [4435.0, 205.96138613861365], [4499.0, 25.0], [4563.0, 81.32611464968157], [4627.0, 485.4954128440367], [4691.0, 900.0], [4755.0, 419.64974093264254], [4947.0, 133.86952714535911], [5075.0, 531.7088888888882], [5011.0, 1253.0], [4883.0, 1254.0], [5267.0, 506.5084175084174], [5203.0, 1249.0], [5395.0, 244.73419864559787], [5459.0, 218.91410392364813], [5523.0, 904.6666666666666], [5587.0, 437.4060657118791], [5651.0, 359.92647683807894], [5715.0, 305.4769452449568], [5779.0, 651.0], [5843.0, 90.40294117647053], [5971.0, 589.0721003134795], [6163.0, 347.6720124159337], [6291.0, 850.5], [6355.0, 1225.0], [6483.0, 216.07287671232888], [6547.0, 780.3339768339771], [6675.0, 657.0], [6739.0, 283.7428307123039], [7059.0, 160.34332425068106], [6931.0, 1215.0], [7251.0, 758.4441805225645], [7315.0, 206.21753554502368], [7379.0, 849.5029940119766], [7635.0, 101.55643203883497], [7699.0, 604.0862282878414], [7891.0, 911.9573170731711], [7827.0, 1038.0], [8019.0, 912.6485714285709], [8147.0, 1033.3333333333333], [8230.0, 255.2057877813504], [8358.0, 537.5365148228495], [8486.0, 394.61743656473675], [8742.0, 271.0], [8870.0, 658.0374087591248], [8998.0, 551.2341463414638], [9254.0, 1059.3995433789955], [9382.0, 264.3473684210527], [9638.0, 835.3676268861452], [9510.0, 431.6], [9766.0, 1333.5706521739128], [9894.0, 363.5213523131675], [8233.0, 780.0], [8617.0, 756.3228155339812], [8745.0, 772.0], [9001.0, 1012.0], [9129.0, 275.757614213198], [9385.0, 240.95969773299754], [9513.0, 182.66523867809065], [9641.0, 934.8929765886293], [9897.0, 758.6666666666666], [1061.0, 155.20441988950273], [1045.0, 878.0], [1093.0, 47.22950819672131], [1141.0, 23.397350993377497], [1157.0, 24.100449775112445], [1205.0, 56.72661870503591], [1189.0, 60.754385964912316], [1173.0, 54.310264746864966], [1221.0, 60.38137472283814], [1269.0, 26.0920245398773], [1253.0, 28.005673758865274], [1237.0, 30.272727272727273], [1285.0, 22.125], [1301.0, 1.230769230769231], [1333.0, 56.78529411764703], [1317.0, 68.04933504933496], [1349.0, 74.79252336448613], [1397.0, 105.10526315789474], [1365.0, 61.544910179640716], [1381.0, 866.5], [1413.0, 79.35698447893566], [1461.0, 88.97181372549022], [1445.0, 61.51162790697674], [1429.0, 82.52519517388218], [1477.0, 73.44356435643567], [1493.0, 57.66666666666667], [1525.0, 52.17768595041326], [1509.0, 92.9567307692308], [1589.0, 84.20105820105827], [1573.0, 9.748717948717948], [1557.0, 76.82830315224689], [1605.0, 75.18275684047478], [1621.0, 67.74720210664928], [1653.0, 133.1724137931035], [1637.0, 102.55079006772013], [1685.0, 24.030141843971617], [1669.0, 57.52711111111109], [1701.0, 67.69473684210527], [1781.0, 88.44726930320147], [1749.0, 20.17391304347826], [1765.0, 106.09270386266081], [1797.0, 97.83418367346945], [1813.0, 78.23926380368094], [1845.0, 473.5], [1829.0, 101.78015783540029], [1861.0, 80.85714285714282], [1877.0, 55.01630434782609], [1893.0, 64.46003552397873], [1909.0, 116.24309392265197], [1925.0, 109.52173913043471], [1941.0, 80.60468749999994], [1973.0, 166.5869565217391], [1957.0, 122.34848484848479], [1989.0, 100.29976303317528], [2005.0, 97.84931506849317], [2037.0, 3.568576388888891], [2021.0, 58.04470359572404], [2058.0, 54.15686274509805], [2090.0, 7.0], [2122.0, 156.4048913043479], [2282.0, 60.299879081015696], [2218.0, 118.67085261070731], [2250.0, 148.63822751322766], [2378.0, 12.472477064220186], [2346.0, 836.0], [2538.0, 114.19695321001068], [2506.0, 828.0], [2474.0, 831.6666666666666], [2570.0, 207.33333333333331], [2666.0, 109.19196428571428], [2634.0, 825.5], [2698.0, 144.42339832869092], [2730.0, 226.05882352941165], [2794.0, 525.5], [2762.0, 820.0], [2826.0, 122.28392484342375], [2858.0, 181.73599999999996], [2922.0, 238.0], [2986.0, 108.66570188133146], [3018.0, 166.41120000000018], [2954.0, 849.0], [3082.0, 170.5591240875912], [3210.0, 136.7830188679245], [3242.0, 198.7710255018991], [3274.0, 171.7159956474428], [3370.0, 159.78450578806766], [3402.0, 213.9872372372373], [3498.0, 136.68981481481504], [3530.0, 296.69039623908634], [3562.0, 1069.0], [3626.0, 191.0], [3690.0, 184.04744852282866], [3594.0, 1068.0], [3722.0, 219.89400363416092], [3818.0, 147.63329161451813], [3850.0, 378.31349782293154], [3882.0, 115.0], [3914.0, 397.0], [3978.0, 117.23386243386244], [4010.0, 134.18617683686185], [4180.0, 366.21039448966866], [4244.0, 119.0], [4308.0, 104.1741176470588], [4500.0, 245.56279701289836], [4628.0, 269.05787348586733], [4692.0, 567.5034965034968], [4820.0, 200.14923619271443], [4948.0, 125.86021505376344], [5012.0, 535.250157133878], [5076.0, 333.363067292645], [4884.0, 1254.0], [5204.0, 103.0], [5268.0, 412.2463667820068], [5396.0, 360.51054852320686], [5460.0, 303.5528396836814], [5588.0, 136.65384615384616], [5716.0, 384.69746909947094], [5780.0, 632.0731182795706], [5844.0, 97.78609625668435], [5908.0, 560.6607431340872], [5972.0, 114.9591584158417], [6036.0, 314.2677685950413], [6164.0, 256.2351648351647], [6292.0, 851.0], [6356.0, 439.0130331753555], [6548.0, 386.1958598726119], [6612.0, 1220.0], [6484.0, 1222.0], [6740.0, 332.2211538461537], [6868.0, 560.7222222222222], [6804.0, 1217.0], [7060.0, 784.0], [7124.0, 1014.6666666666666], [6932.0, 1216.0], [7252.0, 794.0], [7316.0, 482.0], [7380.0, 256.72687545520654], [7444.0, 615.3598326359836], [7508.0, 273.095238095238], [7700.0, 702.2576028622539], [7764.0, 605.8279883381923], [7828.0, 532.5628626692463], [7892.0, 939.2848141146812], [7956.0, 530.7297297297308], [8020.0, 913.4143126177021], [8084.0, 518.0], [8148.0, 741.5555555555551], [8232.0, 189.88324873096448], [8488.0, 737.3333333333333], [8616.0, 868.7533123028383], [8744.0, 318.90419161676664], [9128.0, 358.0734426229503], [9000.0, 1693.75], [8872.0, 1017.0], [9256.0, 145.84563758389282], [9512.0, 179.06329113924073], [9640.0, 420.0], [9768.0, 106.5045045045045], [9896.0, 783.0], [8235.0, 550.3041775456917], [8363.0, 853.1770963704622], [8491.0, 408.9784883720931], [8619.0, 198.73099415204675], [8747.0, 319.69186381996525], [8875.0, 973.0044052863433], [9003.0, 1051.173170731706], [9259.0, 397.674251497006], [9387.0, 374.0], [9643.0, 1080.3281249999998], [9771.0, 503.5170142700327], [9899.0, 933.4461118690308], [4181.0, 301.19505494505495], [4373.0, 270.3829174664106], [4501.0, 334.55043227665703], [4565.0, 228.0], [4693.0, 410.0528559249778], [4821.0, 261.4789644012943], [4885.0, 248.67045454545448], [5013.0, 216.3249001331557], [5141.0, 427.3642105263163], [5269.0, 198.969904240766], [5333.0, 263.1025132275127], [5205.0, 1247.0], [5461.0, 1062.0], [5589.0, 252.0], [5525.0, 1242.0], [5717.0, 936.0], [5781.0, 541.4574115044235], [5653.0, 1240.0], [5909.0, 511.8018072289169], [5973.0, 163.54073033707857], [6037.0, 274.05498489426], [6165.0, 667.5], [6229.0, 232.08287292817684], [6357.0, 484.2914642609293], [6613.0, 761.1057192374349], [6549.0, 1221.0], [6741.0, 522.0], [6805.0, 286.38568019093054], [6869.0, 673.1362745098036], [6933.0, 231.54329840044144], [7061.0, 320.07914438502667], [7125.0, 772.9240139211132], [6997.0, 1056.5], [7189.0, 257.53651685393254], [7317.0, 499.0], [7381.0, 256.0], [7445.0, 700.5903614457832], [7509.0, 188.99529042386237], [7573.0, 793.1423570595105], [7701.0, 826.0], [7765.0, 293.87735341581526], [7829.0, 612.9735058533591], [7893.0, 196.212201591512], [7957.0, 529.9376344086023], [8021.0, 290.8593155893537], [8085.0, 334.4772872680736], [8149.0, 633.5850767085072], [8362.0, 624.2227414330218], [8874.0, 899.7953846153848], [9130.0, 605.8461538461538], [9386.0, 275.72242206235035], [9642.0, 1019.0945454545462], [9898.0, 743.2441613588112], [9770.0, 413.0], [8493.0, 549.75], [8621.0, 176.64028776978415], [8365.0, 1029.0], [8749.0, 867.6666666666666], [9133.0, 667.8798219584581], [8877.0, 1016.066666666667], [9261.0, 541.6666666666666], [9517.0, 418.3130699088144], [9645.0, 421.6666666666667], [2059.0, 614.6], [2091.0, 67.0622406639005], [2123.0, 64.58333333333333], [2283.0, 85.97674418604645], [2219.0, 118.69449378330373], [2251.0, 144.49230769230778], [2315.0, 68.62147505422983], [2411.0, 149.52439024390245], [2443.0, 164.8670576735092], [2475.0, 602.6], [2571.0, 152.71024464831783], [2635.0, 245.0], [2667.0, 232.5], [2699.0, 111.54673495518578], [2731.0, 151.90692969145158], [2763.0, 172.33555555555546], [2827.0, 230.0], [2923.0, 163.41187925998048], [2859.0, 122.0772833723653], [2891.0, 223.76809557273404], [2955.0, 544.25], [2987.0, 240.0], [3083.0, 61.46162402669633], [3147.0, 253.0], [3243.0, 101.17928902627513], [3275.0, 166.93479623824447], [3339.0, 107.0], [3403.0, 164.00083333333362], [3435.0, 196.89025460930637], [3563.0, 200.61969035331475], [3595.0, 220.84677419354838], [3723.0, 117.06179066834804], [3755.0, 283.59016393442596], [3819.0, 276.3333333333333], [3947.0, 307.5], [3851.0, 114.98935298935308], [3883.0, 130.0016778523489], [4011.0, 151.95220243673862], [4118.0, 362.6338582677167], [4246.0, 292.7160493827161], [4310.0, 184.00000000000003], [4374.0, 114.75175047740291], [4502.0, 514.0], [4566.0, 194.81055900621124], [4630.0, 101.0], [4694.0, 157.33702531645577], [4758.0, 526.2172131147538], [4886.0, 227.60541727672035], [4950.0, 66.5], [5014.0, 241.0], [5142.0, 138.07958477508663], [5206.0, 295.88888888888846], [5334.0, 337.06470588235294], [5526.0, 307.1573670444641], [5590.0, 746.5], [5462.0, 1244.0], [5782.0, 105.50505050505048], [5846.0, 203.929503916449], [5974.0, 336.3333333333333], [6038.0, 498.0], [6102.0, 538.9006116207953], [6230.0, 244.8611898016999], [6294.0, 368.0646437994723], [6422.0, 695.0026501766782], [6486.0, 227.73214285714306], [6614.0, 202.0790816326535], [6550.0, 1221.0], [6678.0, 712.1409657320879], [6806.0, 182.85458167330697], [6870.0, 717.4909716251069], [6934.0, 342.4768946395563], [6998.0, 478.04733131923484], [7062.0, 144.59546539379485], [7126.0, 661.3024691358028], [7190.0, 381.4025194961006], [7254.0, 816.4029850746275], [7318.0, 499.00438596491233], [7510.0, 344.078431372549], [7574.0, 429.49574468085115], [7638.0, 373.3663003663003], [7830.0, 980.5], [7894.0, 1038.0], [7702.0, 1041.0], [8086.0, 448.03300733496314], [8150.0, 1033.0], [8236.0, 498.0168067226884], [8492.0, 236.31378763866863], [8620.0, 153.45477014335148], [8364.0, 1029.0], [8748.0, 443.38416763678674], [9004.0, 162.36876355748385], [9132.0, 603.3002832861188], [9260.0, 357.1298507462687], [9516.0, 832.383141762452], [9644.0, 1159.0], [9388.0, 757.1666666666666], [9772.0, 345.92637644046056], [9900.0, 1611.25], [8367.0, 742.1209302325574], [8495.0, 561.6153846153846], [8239.0, 1031.25], [8751.0, 581.5053627760252], [8879.0, 316.97914494264876], [9007.0, 216.9918699186992], [9135.0, 605.0], [9263.0, 532.0669642857147], [9391.0, 682.0435643564357], [9519.0, 98.5], [9647.0, 167.84752104770814], [9775.0, 524.0], [9903.0, 1175.6323232323227], [4119.0, 116.54198152812742], [4247.0, 249.60437375745514], [4311.0, 262.0], [4439.0, 320.37001684446926], [4567.0, 338.80332541567697], [4631.0, 240.05294117647048], [4759.0, 411.15000000000003], [4823.0, 473.5], [4887.0, 387.9614973262033], [4951.0, 189.708833151581], [5079.0, 464.120541205412], [5207.0, 345.03496503496507], [5271.0, 1246.0], [5399.0, 430.5444664031618], [5655.0, 677.0], [5847.0, 279.80760626398194], [5783.0, 1239.0], [6039.0, 498.0], [6103.0, 396.4886174347579], [6167.0, 577.9400000000004], [6231.0, 387.0], [6295.0, 638.2967532467536], [6359.0, 21.0], [6423.0, 724.1263467189024], [6487.0, 206.04968383017143], [6615.0, 140.0], [6551.0, 1221.0], [6679.0, 519.4303405572757], [6743.0, 607.6787148594381], [6871.0, 1035.0], [6807.0, 1217.0], [6935.0, 407.0], [6999.0, 169.19961856325517], [7255.0, 570.4400705052873], [7319.0, 640.4023825281274], [7383.0, 1046.5], [7511.0, 507.0], [7639.0, 362.93842364532054], [7575.0, 1271.5], [7767.0, 840.75], [7895.0, 1038.0], [7959.0, 795.0], [8366.0, 1039.5], [8622.0, 372.0], [8494.0, 1026.0], [8878.0, 1054.7031250000005], [9006.0, 244.0], [9134.0, 733.3333333333334], [8750.0, 1019.0], [9390.0, 682.3333333333345], [9518.0, 292.12316715542516], [9646.0, 1179.79809976247], [9902.0, 1802.8], [8241.0, 158.86554621848742], [8497.0, 725.029684601114], [8625.0, 300.9253731343286], [8369.0, 1029.0], [8881.0, 409.0], [9009.0, 477.0], [9137.0, 697.4347826086961], [9265.0, 782.1296928327638], [9521.0, 931.397129186603], [9649.0, 579.0], [9777.0, 824.8707865168542], [9905.0, 2154.0], [515.0, 15.86851520572453], [539.0, 10.919844861021344], [531.0, 1.5831842576028619], [523.0, 36.05116959064319], [547.0, 10.453767123287683], [555.0, 13.87433798748194], [563.0, 11.59047619047619], [571.0, 896.0], [579.0, 22.738693467336688], [603.0, 0.7272727272727273], [595.0, 12.71997345719972], [587.0, 13.8124557678698], [619.0, 14.82905982905984], [611.0, 72.0], [635.0, 11.373626373626367], [627.0, 16.152579582875966], [651.0, 71.0], [667.0, 13.267699115044257], [675.0, 7.292307692307692], [683.0, 74.0], [699.0, 14.285185185185183], [707.0, 15.229385307346327], [731.0, 488.5], [723.0, 890.0], [715.0, 891.0], [739.0, 8.243902439024389], [747.0, 74.83333333333333], [763.0, 77.43548387096774], [755.0, 62.84630350194555], [771.0, 60.687315634218265], [779.0, 17.809895833333336], [795.0, 32.14685314685315], [787.0, 46.754834684965665], [803.0, 47.47752332485153], [811.0, 72.25], [827.0, 35.606827309236955], [819.0, 18.277227722772245], [835.0, 59.73372781065089], [843.0, 55.186739659367305], [859.0, 28.238578680203023], [851.0, 0.9591836734693878], [867.0, 48.58271144278613], [875.0, 31.910147991543305], [891.0, 19.546413502109704], [883.0, 2.634831460674161], [899.0, 36.58734764944858], [923.0, 3.519230769230769], [915.0, 43.474245115453016], [907.0, 47.01209677419364], [939.0, 1.0], [955.0, 74.09611586570107], [947.0, 25.658012533572048], [963.0, 26.42532467532471], [971.0, 26.815980629539943], [987.0, 19.05727699530516], [979.0, 19.875787578757826], [995.0, 3.3925233644859816], [1003.0, 78.85945945945944], [1019.0, 51.321663019693666], [1011.0, 52.188118811881175], [1078.0, 54.43598055105352], [1062.0, 32.37017208413006], [1046.0, 36.986530760830036], [1094.0, 61.55149330587023], [1142.0, 73.39285714285712], [1126.0, 52.09941520467836], [1110.0, 476.5], [1206.0, 30.80064308681673], [1190.0, 21.699999999999992], [1174.0, 875.0], [1158.0, 875.0], [1238.0, 344.6666666666667], [1222.0, 65.89694041867963], [1302.0, 1.1363636363636367], [1286.0, 62.95731950538505], [1334.0, 65.21428571428571], [1318.0, 31.665760869565243], [1350.0, 26.954861111111104], [1366.0, 64.41273326015374], [1398.0, 59.144846796657276], [1382.0, 62.79527559055115], [1430.0, 79.80930232558141], [1462.0, 53.63585951940849], [1446.0, 420.1818181818182], [1478.0, 93.12858052196063], [1494.0, 52.5], [1526.0, 65.45201238390081], [1510.0, 12.539473684210526], [1542.0, 1.8986486486486502], [1558.0, 179.01428571428565], [1590.0, 155.40466101694906], [1574.0, 65.05647668393792], [1606.0, 93.97260273972596], [1622.0, 103.99999999999997], [1654.0, 98.66972477064213], [1638.0, 7.749999999999997], [1670.0, 71.90317052270774], [1686.0, 64.98953662182359], [1718.0, 64.63947368421056], [1702.0, 62.44383424862692], [1734.0, 59.85833333333333], [1750.0, 1.3076923076923073], [1766.0, 83.0], [1782.0, 854.0], [1798.0, 129.44117647058823], [1846.0, 82.62016718913283], [1814.0, 109.21772805507736], [1830.0, 222.58749999999995], [1862.0, 79.56493506493504], [1878.0, 64.5026595744681], [1910.0, 8.0], [1894.0, 105.26343381389253], [1926.0, 569.0], [1974.0, 34.0], [1942.0, 20.31969696969697], [1958.0, 115.50216450216448], [1990.0, 116.32745591939539], [2006.0, 60.21379310344827], [2022.0, 61.18515321536472], [2038.0, 846.0], [2060.0, 60.944253859348116], [2092.0, 73.8842794759826], [2124.0, 70.88012618296533], [2188.0, 108.76338639652671], [2284.0, 144.82720178372338], [2252.0, 100.48250000000004], [2316.0, 183.74868004223887], [2348.0, 67.73644859813089], [2412.0, 88.00573065902577], [2380.0, 101.55079559363534], [2444.0, 85.11564625850343], [2540.0, 144.0], [2476.0, 556.5], [2508.0, 252.5], [2572.0, 105.28809788654051], [2604.0, 279.5409836065574], [2636.0, 169.57449664429578], [2668.0, 824.5], [2732.0, 139.1995515695069], [2764.0, 127.79831144465291], [2796.0, 179.5552795031055], [2700.0, 822.0], [2860.0, 104.0], [2892.0, 150.27005347593587], [2924.0, 138.1981687377372], [2828.0, 823.0], [2956.0, 250.45312499999991], [3052.0, 50.71311025781683], [2988.0, 848.0], [3116.0, 178.22156398104275], [3148.0, 163.76132404181183], [3212.0, 253.0], [3308.0, 251.65637065637054], [3436.0, 245.84464751958237], [3372.0, 263.0], [3404.0, 246.0], [3468.0, 140.11517509727636], [3596.0, 161.9495145631073], [3628.0, 113.99188156638037], [3692.0, 198.33333333333331], [3756.0, 291.25768087215], [3788.0, 214.3905325443786], [3884.0, 104.25874485596704], [3916.0, 357.98941798941803], [3948.0, 520.1714285714286], [3980.0, 294.0], [4012.0, 349.0], [4044.0, 178.85756240822303], [4076.0, 235.58005249343833], [4312.0, 283.6526315789474], [4376.0, 198.75], [4440.0, 123.17191601049859], [4568.0, 172.90566037735854], [4632.0, 242.00289687137902], [4760.0, 188.51278269419888], [4696.0, 1418.0], [4952.0, 296.0975143403446], [5016.0, 265.0], [5080.0, 739.7030162412997], [5336.0, 1246.0], [5400.0, 281.37635869565264], [5464.0, 403.64487534626016], [5528.0, 601.75], [5592.0, 202.0953565505804], [5656.0, 645.1719971570724], [5784.0, 256.0], [5848.0, 258.8242530755709], [5720.0, 1239.0], [5912.0, 189.60202020202013], [5976.0, 383.5198863636364], [6168.0, 660.7183257918552], [6296.0, 960.5], [6360.0, 804.6281588447648], [6552.0, 265.5], [6744.0, 576.8808882907136], [7000.0, 229.0], [7064.0, 722.3565217391306], [6936.0, 1019.0], [7256.0, 218.3140096618358], [7320.0, 724.1701323251418], [7384.0, 195.40161104718084], [7448.0, 864.9924528301888], [7576.0, 1729.0], [7512.0, 1044.5], [7704.0, 707.8914246196399], [7768.0, 294.1617647058823], [7896.0, 1038.0], [7832.0, 1038.0], [7960.0, 814.2142857142858], [8024.0, 668.5], [8088.0, 769.2712550607279], [8152.0, 1033.0], [8240.0, 721.9923539049687], [8368.0, 153.46022727272728], [8496.0, 531.21347607053], [8624.0, 570.0554539914672], [8752.0, 540.2011776251222], [8880.0, 180.04835589941968], [9008.0, 321.3231884057975], [9136.0, 786.0], [9264.0, 662.9632578077166], [9392.0, 886.0], [9648.0, 197.42857142857144], [9776.0, 661.774419859688], [9904.0, 1057.4533954727028], [8243.0, 240.0], [8627.0, 23.0], [8371.0, 1029.0], [8755.0, 474.0858164481526], [8883.0, 336.729468599034], [9011.0, 1011.0], [9395.0, 914.5361842105259], [9651.0, 260.350346565848], [9267.0, 442.0], [9907.0, 398.0], [4185.0, 266.6293408929833], [4249.0, 511.0], [4313.0, 300.99385560675904], [4505.0, 418.49949031600414], [4633.0, 272.31729323308275], [4825.0, 257.88085106382937], [4889.0, 523.0], [5017.0, 259.0457399103142], [5145.0, 191.8128491620111], [5273.0, 229.62276785714252], [5465.0, 151.385756676558], [5593.0, 531.0], [5529.0, 1242.0], [5657.0, 162.3958560523446], [5721.0, 481.93426458504507], [5849.0, 668.0], [5913.0, 215.66101694915275], [5977.0, 339.65367088607627], [6041.0, 650.2041127189634], [6169.0, 137.2264150943397], [6361.0, 332.08948194662446], [6233.0, 1228.0], [6489.0, 978.0], [6553.0, 372.43835616438406], [6617.0, 974.5], [6745.0, 1135.4], [6809.0, 251.11830357142892], [6873.0, 981.0], [6937.0, 580.0245901639347], [7065.0, 233.1868497711193], [7129.0, 174.27670250895994], [7001.0, 1056.0], [7385.0, 239.02972802024033], [7321.0, 1048.0], [7449.0, 404.5521788990828], [7513.0, 547.3090211132434], [7641.0, 1726.75], [7705.0, 250.39778449144015], [7769.0, 326.86037554164744], [7833.0, 837.5499124343261], [7897.0, 217.84332925336608], [7961.0, 809.1564766839367], [8025.0, 236.14901098901075], [8089.0, 666.8932038834956], [8153.0, 247.08238482384849], [8242.0, 972.6], [8626.0, 2385.0], [9138.0, 748.1129129129114], [8882.0, 1015.0], [9522.0, 899.1885143570534], [9650.0, 419.0], [9394.0, 435.0], [9266.0, 598.0], [9906.0, 2157.0], [9778.0, 413.0], [8245.0, 279.0958049886622], [8373.0, 233.9284603421462], [8629.0, 790.9646892655371], [8885.0, 298.3264367816095], [9013.0, 645.6996587030715], [9141.0, 1053.9999999999995], [9269.0, 1237.5018477457477], [9653.0, 504.0], [9525.0, 432.6666666666667], [9781.0, 1002.1166666666671], [9909.0, 448.9798994974876], [2061.0, 12.77077363896848], [2093.0, 94.68027210884351], [2125.0, 136.4865497076023], [2157.0, 841.5], [2189.0, 112.23848019401774], [2285.0, 151.6885245901639], [2253.0, 118.70967741935482], [2221.0, 840.5], [2317.0, 234.3177570093458], [2349.0, 107.36756187467071], [2381.0, 89.79930795847756], [2413.0, 832.0], [2445.0, 108.0834575260804], [2477.0, 165.79101562499997], [2509.0, 160.21530802738002], [2605.0, 137.323142250531], [2637.0, 124.58333333333347], [2669.0, 181.07806691449846], [2765.0, 156.0], [2797.0, 140.29668246445513], [2733.0, 826.0], [2829.0, 166.29719137818412], [2925.0, 172.0], [2957.0, 156.0609804703068], [2989.0, 177.85177865612624], [3021.0, 263.0], [3053.0, 33.563283922462915], [3149.0, 146.69475240206927], [3181.0, 192.23833229620394], [3213.0, 177.68971477960235], [3309.0, 196.7162346521145], [3341.0, 179.1940789473683], [3373.0, 277.3743589743589], [3437.0, 145.73264401772514], [3469.0, 96.29643117261476], [3501.0, 266.95673794132307], [3533.0, 261.0], [3565.0, 1071.0], [3629.0, 82.42015209125469], [3661.0, 424.6202702702705], [3597.0, 1067.5], [3789.0, 147.95853658536583], [3821.0, 166.57696566998888], [3949.0, 163.5416479063484], [3885.0, 149.83962264150935], [3917.0, 276.9657936932124], [4077.0, 105.61201923076918], [4045.0, 311.2375809935201], [4186.0, 238.33829787234026], [4378.0, 220.09245283018876], [4442.0, 174.0], [4506.0, 135.27989657401443], [4570.0, 532.3785714285711], [4698.0, 419.7492163009407], [4826.0, 1256.0], [5018.0, 392.50609756097566], [5082.0, 84.0], [4954.0, 1253.5], [5146.0, 252.9294330518695], [5210.0, 560.4317180616744], [5274.0, 287.3571428571428], [5338.0, 540.5740740740747], [5466.0, 235.0], [5530.0, 338.00833333333276], [5594.0, 1241.0], [5402.0, 1244.0], [5722.0, 376.6680602006687], [5786.0, 195.5033952014488], [5914.0, 230.1485451761101], [6042.0, 651.8313953488372], [6234.0, 448.51751690227417], [6362.0, 165.50404312668465], [6170.0, 1232.0], [6554.0, 430.5372750642675], [6618.0, 232.40858318636103], [6490.0, 1222.5], [6426.0, 1224.0], [6682.0, 754.0], [6810.0, 334.0360419397121], [6874.0, 274.47797797797773], [6938.0, 681.3355426677718], [7130.0, 127.39146991622239], [7002.0, 1057.0], [7194.0, 617.1181250000016], [7386.0, 518.0], [7258.0, 1049.0], [7450.0, 170.93150684931504], [7514.0, 707.7446626814682], [7578.0, 229.92820181112583], [7642.0, 1043.0], [7770.0, 387.3333333333333], [7834.0, 366.3901830282855], [7898.0, 391.8461538461538], [7962.0, 164.1569343065694], [8026.0, 171.6305418719212], [8090.0, 545.3333333333333], [8154.0, 351.2167832167831], [8244.0, 218.5350500715308], [8372.0, 336.1915945611866], [8628.0, 895.9618473895586], [8756.0, 134.62269938650294], [8884.0, 282.8251302837288], [9012.0, 571.9704180064311], [9140.0, 817.5], [9268.0, 881.8415672913119], [9396.0, 1243.8320610687022], [9652.0, 235.37362637362668], [9780.0, 938.469200524246], [9908.0, 261.6530120481922], [8503.0, 1063.0962732919256], [8759.0, 187.0457317073173], [8887.0, 505.2052238805971], [9015.0, 765.0], [9143.0, 137.527868852459], [9399.0, 1261.0742857142855], [9527.0, 713.3782696177071], [9655.0, 372.4719334719341], [9271.0, 374.2], [9911.0, 397.5], [4123.0, 299.10855263157987], [4251.0, 190.5772428884029], [4379.0, 371.98705966930214], [4443.0, 257.3076923076923], [4571.0, 359.6417569880211], [4635.0, 506.0], [4699.0, 405.6117769671703], [4763.0, 196.6666666666667], [4827.0, 222.0], [4891.0, 307.070533948583], [4955.0, 574.685840707965], [5019.0, 880.0], [5211.0, 563.8939292861901], [5339.0, 440.51607445008466], [5147.0, 1249.0], [5531.0, 132.28773584905667], [5595.0, 1241.0], [5467.0, 1243.0], [5403.0, 1244.0], [5787.0, 343.2534562211982], [5851.0, 536.0537634408604], [5723.0, 1238.5], [6043.0, 742.5], [6107.0, 247.40413533834607], [6171.0, 1225.8000000000002], [6235.0, 356.3895809739526], [6299.0, 493.5438596491227], [6363.0, 369.0], [6427.0, 202.68910133843178], [6491.0, 442.95922528032617], [6555.0, 667.0], [6619.0, 255.48378378378396], [6683.0, 209.27913587265533], [6875.0, 138.7840531561463], [7003.0, 243.0948275862069], [7195.0, 690.1367292225199], [7259.0, 250.52941176470574], [7323.0, 662.206790123456], [7515.0, 790.0], [7579.0, 226.65923566878993], [7643.0, 601.4877843302448], [7707.0, 1912.0], [8155.0, 275.0], [8246.0, 235.25000000000006], [8502.0, 667.8047158403881], [8630.0, 1023.0], [8758.0, 209.66666666666666], [9142.0, 211.47459252157188], [9014.0, 1148.0], [9526.0, 1106.250702247189], [9654.0, 420.3571428571428], [9910.0, 397.0], [8249.0, 455.86856617647084], [8377.0, 671.0858208955223], [8505.0, 1066.8333333333333], [8633.0, 1100.8169014084535], [8761.0, 469.18471337579604], [8889.0, 401.7730192719483], [9017.0, 949.5955610357587], [9273.0, 533.4892167990912], [9657.0, 771.0], [9529.0, 431.6], [9401.0, 893.5], [9785.0, 1173.2466460268345], [9913.0, 379.6528354080216], [1031.0, 46.626865671641795], [1079.0, 41.5931326434619], [1047.0, 878.0], [1111.0, 56.33959670027495], [1095.0, 21.6248366013072], [1143.0, 61.88815789473686], [1127.0, 66.97959183673483], [1159.0, 87.69879518072284], [1175.0, 244.70000000000002], [1207.0, 32.985294117647044], [1191.0, 341.0], [1239.0, 56.48206967213116], [1223.0, 43.474337748344404], [1255.0, 60.92235123367193], [1303.0, 15.177215189873419], [1287.0, 23.20467836257309], [1335.0, 77.95386266094424], [1319.0, 102.0], [1399.0, 69.97789115646265], [1383.0, 73.10071942446045], [1367.0, 29.333333333333332], [1463.0, 64.97252289758532], [1447.0, 69.61706783369812], [1431.0, 26.43141592920356], [1479.0, 126.85714285714286], [1495.0, 74.51940298507455], [1527.0, 81.77422389463783], [1511.0, 130.80434782608697], [1591.0, 22.4375], [1575.0, 83.66431095406361], [1559.0, 861.0], [1543.0, 861.0], [1607.0, 14.052631578947368], [1623.0, 3.0], [1655.0, 87.7731958762887], [1639.0, 19.448616600790523], [1671.0, 81.23780487804876], [1687.0, 132.1395348837209], [1719.0, 74.52111872146119], [1703.0, 95.52428571428578], [1735.0, 64.35769230769236], [1783.0, 60.97763419483097], [1767.0, 70.57573502046888], [1751.0, 56.098942598187314], [1847.0, 108.2664576802508], [1799.0, 854.0], [1863.0, 132.01437371663232], [1911.0, 95.20292504570375], [1879.0, 98.19150285351944], [1895.0, 118.92973651191956], [1927.0, 39.38709677419356], [1943.0, 109.06347897774108], [1975.0, 28.0], [1959.0, 55.226446280991745], [1991.0, 59.00281690140841], [2007.0, 82.84722999440402], [2023.0, 84.66800000000006], [2039.0, 846.0], [2094.0, 108.77966101694935], [2126.0, 98.97707736389684], [2158.0, 87.56864988558348], [2222.0, 165.99811320754714], [2254.0, 113.94537815126054], [2286.0, 103.69225888324884], [2318.0, 19.4200913242009], [2350.0, 128.70144927536217], [2414.0, 137.0], [2382.0, 19.74924012158053], [2478.0, 121.71126760563388], [2510.0, 121.94550669216045], [2542.0, 198.2123893805311], [2638.0, 133.00000000000003], [2670.0, 135.07520621057765], [2606.0, 825.5], [2702.0, 262.84615384615387], [2734.0, 241.0], [2798.0, 228.0], [2830.0, 115.53838951310857], [2862.0, 198.03562653562645], [2894.0, 137.33333333333334], [2990.0, 128.23084200567652], [3022.0, 137.93215158924184], [3054.0, 285.0], [3086.0, 136.1729074889867], [3182.0, 119.33512352309336], [3214.0, 165.6818181818179], [3246.0, 164.169724770642], [3310.0, 265.0], [3342.0, 174.47878787878773], [3374.0, 225.94727793696322], [3470.0, 218.0], [3502.0, 142.86967418546354], [3534.0, 195.46704871060183], [3566.0, 1072.0], [3598.0, 274.0], [3630.0, 215.0], [3662.0, 214.37763713080153], [3694.0, 112.41603718768155], [3758.0, 506.0], [3822.0, 99.84133333333342], [3854.0, 185.02877697841728], [3918.0, 267.33130699088156], [3950.0, 103.34979423868316], [3982.0, 303.6532451923075], [4014.0, 454.27272727272725], [4124.0, 315.77475247524757], [4252.0, 341.81227436823104], [4444.0, 210.4959718026185], [4572.0, 149.37909516380645], [4636.0, 386.03266331658284], [4764.0, 298.5471576227389], [4828.0, 189.0], [4700.0, 1259.0], [4892.0, 128.44943820224714], [4956.0, 306.65314009661864], [5084.0, 404.2321965897683], [5148.0, 528.0], [5212.0, 133.73052362707534], [5276.0, 473.0], [5404.0, 178.1127336448599], [5596.0, 537.7135306553913], [5532.0, 1242.0], [5468.0, 1243.0], [5660.0, 231.99462365591384], [5852.0, 677.7245192307694], [5916.0, 473.3251231527096], [6108.0, 371.2070282658517], [6300.0, 151.71661490683258], [6364.0, 1225.0], [6236.0, 1227.0], [6172.0, 1229.0], [6492.0, 631.7574536663984], [6556.0, 1221.0], [6428.0, 1224.0], [6684.0, 251.03641456582642], [6748.0, 749.7950191570875], [6812.0, 533.0], [7004.0, 267.8505747126436], [7068.0, 240.49919224555714], [7132.0, 1053.0], [7260.0, 267.71912087912114], [7324.0, 400.376197680282], [7388.0, 371.3343151693669], [7580.0, 315.8888888888889], [7644.0, 789.0487804878059], [7772.0, 344.0], [7900.0, 1039.0], [7708.0, 1041.0], [8028.0, 999.0], [8092.0, 712.376168224299], [7964.0, 1037.0], [8376.0, 559.0069747166517], [8632.0, 1136.9189814814808], [8504.0, 1027.0], [8760.0, 411.98682042833553], [8888.0, 485.07226236798203], [9016.0, 1030.3185840707965], [9272.0, 1096.0], [9400.0, 288.9876363636364], [9528.0, 382.4], [9656.0, 477.796686746988], [9912.0, 314.6430738119311], [9784.0, 413.0], [8507.0, 736.2592364532026], [8379.0, 1028.0], [8251.0, 1031.0], [8763.0, 458.0], [8891.0, 534.3333333333334], [9147.0, 245.18625872249078], [9275.0, 217.0], [9531.0, 196.2465051258156], [9659.0, 813.1600294985253], [4189.0, 287.51388888888886], [4253.0, 858.0], [4317.0, 225.89979859013116], [4445.0, 300.67581047381543], [4637.0, 260.6885085574572], [4765.0, 431.3378995433792], [4829.0, 196.79746835443038], [4893.0, 707.5], [5021.0, 356.4679487179488], [5085.0, 109.3333333333334], [5277.0, 372.40180430256834], [5149.0, 1249.0], [5405.0, 256.48571428571427], [5469.0, 229.1233407079644], [5533.0, 960.0], [5597.0, 364.24753867791895], [5661.0, 310.866204162537], [5725.0, 208.89053672316416], [5853.0, 1237.4], [5789.0, 1238.0], [5917.0, 325.0676818950936], [5981.0, 683.5937499999999], [6045.0, 1235.0], [6173.0, 212.7309941520467], [6301.0, 244.0], [6365.0, 319.13800424628414], [6237.0, 1227.0], [6493.0, 760.0], [6557.0, 1221.0], [6685.0, 558.0], [6749.0, 176.19166666666666], [6813.0, 422.5384615384612], [6877.0, 1087.0], [7005.0, 418.2], [7069.0, 166.6315789473684], [7133.0, 296.7557997558], [6941.0, 1214.0], [7197.0, 696.0], [7261.0, 508.0], [7389.0, 458.2793354101762], [7453.0, 190.03673938002296], [7645.0, 2409.0], [7709.0, 274.2987804878047], [7773.0, 375.31693989071067], [7837.0, 273.0], [7901.0, 544.2058536585361], [7965.0, 272.11053984575835], [8029.0, 439.69386637458956], [8093.0, 452.2763092269326], [8157.0, 372.6194398682041], [8250.0, 507.9280457890434], [8506.0, 1162.822784810127], [9018.0, 943.6343042071204], [9146.0, 414.5512422360249], [8762.0, 1019.3333333333334], [9274.0, 171.865051903114], [9530.0, 225.86468646864682], [9786.0, 318.8251285819243], [9914.0, 614.0], [8253.0, 1280.6655172413793], [8381.0, 902.6485355648541], [8637.0, 311.9801980198021], [8765.0, 529.5143581081078], [8893.0, 863.299862448418], [9021.0, 635.8511749347265], [9149.0, 474.25], [9277.0, 246.6949152542375], [9405.0, 452.13712374581905], [9533.0, 368.0], [9661.0, 838.3333333333334], [9789.0, 269.0], [9917.0, 670.7188132164529], [2159.0, 105.05471803461761], [2095.0, 98.7388724035608], [2127.0, 50.89743589743589], [2063.0, 846.0], [2287.0, 151.75959079283862], [2223.0, 117.11368277739956], [2255.0, 144.17257683215135], [2319.0, 20.357357357357344], [2351.0, 68.67523364485983], [2415.0, 244.33333333333337], [2447.0, 369.3571428571429], [2543.0, 113.05398182789938], [2575.0, 159.52642934196325], [2671.0, 825.6666666666666], [2607.0, 825.6666666666666], [2703.0, 152.09809372517856], [2863.0, 135.6580756013747], [2895.0, 227.21119592875306], [3023.0, 63.25187032418959], [3055.0, 187.0], [3087.0, 172.3482298316888], [3119.0, 261.0], [3247.0, 184.16978851963705], [3279.0, 201.17000801924644], [3375.0, 115.16323024054982], [3407.0, 193.85185185185176], [3439.0, 247.0], [3535.0, 166.10582908885104], [3567.0, 188.22702331961588], [3599.0, 291.0], [3695.0, 95.32073434125275], [3727.0, 205.15117581187013], [3759.0, 270.63288718929255], [3823.0, 64.38132295719845], [3855.0, 274.33182503770723], [3887.0, 355.5], [3919.0, 517.0], [3983.0, 266.323361823362], [4015.0, 269.7418655097619], [4079.0, 100.5], [4126.0, 509.0], [4190.0, 193.33812211390472], [4318.0, 151.76039603960373], [4510.0, 204.79876308277858], [4574.0, 235.0], [4638.0, 323.5], [4830.0, 319.74734260016356], [4766.0, 1258.0], [5022.0, 152.9608719955285], [5150.0, 439.2806324110671], [5278.0, 332.1686909581646], [5342.0, 220.81029411764686], [5214.0, 1247.0], [5406.0, 322.5], [5470.0, 288.91913214990154], [5534.0, 222.2271293375394], [5598.0, 1241.0], [5662.0, 383.9364278506558], [5726.0, 206.07108081791594], [5790.0, 546.7342756183745], [5918.0, 333.4855729596047], [5982.0, 601.4664907651725], [6046.0, 223.71570576540765], [6174.0, 209.89013035381774], [6366.0, 302.3258042436691], [6302.0, 1226.0], [6558.0, 611.0525974025966], [6622.0, 383.13666666666654], [6814.0, 440.42956852791906], [6878.0, 205.94958753437226], [6942.0, 578.8151595744671], [7134.0, 268.34049273531326], [7390.0, 800.0], [7326.0, 1048.0], [7454.0, 219.14402003757047], [7518.0, 686.2913616398248], [7582.0, 525.467084639498], [7646.0, 922.0], [7710.0, 521.0], [7774.0, 363.7457737321196], [7838.0, 200.77419354838682], [7902.0, 681.9692982456144], [7966.0, 296.4496420047731], [8030.0, 377.140376266281], [8158.0, 330.85391304347786], [8094.0, 1033.0], [8508.0, 158.6338797814207], [8764.0, 450.00827689992445], [8892.0, 698.2308619650397], [9148.0, 602.0], [9020.0, 1206.2857142857142], [9404.0, 259.1519895629483], [9532.0, 317.0576923076922], [9660.0, 993.4458598726118], [9916.0, 509.9793187347929], [8639.0, 1023.0], [8255.0, 1031.0], [9151.0, 384.33575317604317], [8895.0, 1014.0], [9535.0, 336.94921875], [9663.0, 849.6947040498443], [9791.0, 378.1379310344831], [4191.0, 197.86563876651982], [4255.0, 319.959915611814], [4383.0, 379.5017543859651], [4511.0, 382.9340974212035], [4703.0, 109.77566225165558], [4831.0, 1256.25], [4767.0, 1257.6666666666667], [4895.0, 202.96176008381323], [5087.0, 245.57142857142858], [5151.0, 120.75827814569541], [5215.0, 290.75206611570263], [5279.0, 126.94811320754721], [5343.0, 232.47793726741097], [5535.0, 268.1988817891373], [5599.0, 1240.0], [5663.0, 784.25], [5791.0, 378.1074270557024], [5855.0, 1236.0], [5727.0, 1239.0], [5919.0, 628.0], [5983.0, 255.0], [6047.0, 183.726171243942], [6111.0, 897.6233766233763], [6239.0, 132.9697346600333], [6303.0, 905.6666666666666], [6367.0, 647.0], [6431.0, 341.9044516829526], [6559.0, 624.2597402597406], [6623.0, 452.38618290258387], [6687.0, 568.1885856079401], [6815.0, 513.3735763097952], [6879.0, 268.24618736383474], [6751.0, 1219.0], [6943.0, 154.7459429210966], [7007.0, 584.3287671232874], [7071.0, 366.3200000000006], [7199.0, 317.8888888888886], [7327.0, 788.6666666666666], [7391.0, 1048.0], [7455.0, 204.0], [7519.0, 235.89285714285717], [7583.0, 672.0441898526997], [7647.0, 2412.0], [7711.0, 445.5454545454545], [7839.0, 230.36766809728178], [7967.0, 160.73170731707316], [8095.0, 1218.5714285714287], [8159.0, 1038.5], [8254.0, 810.918933925597], [8382.0, 938.9777424483306], [8638.0, 312.02422611036394], [9022.0, 285.9384517766495], [9150.0, 333.9273809523815], [9278.0, 371.0492753623179], [9406.0, 616.0], [9534.0, 432.6224489795919], [9662.0, 418.6666666666667], [9790.0, 264.6787280701755], [9918.0, 862.0], [8385.0, 331.25], [8641.0, 539.0], [8257.0, 1032.0], [8769.0, 930.4299835255354], [8897.0, 421.14932486100105], [9025.0, 195.05467372134032], [9153.0, 680.75], [9281.0, 434.0], [9409.0, 686.5597532767925], [9537.0, 433.61783439490443], [9665.0, 420.57142857142856], [9921.0, 706.5773739742086], [9793.0, 412.0], [129.0, 3.356401384083044], [131.0, 22.746556473829212], [133.0, 4.683673469387755], [135.0, 33.38783269961975], [137.0, 2.8832487309644694], [139.0, 2.0], [141.0, 843.5], [143.0, 3.093200916730335], [145.0, 222.66666666666669], [147.0, 3.377523553162855], [149.0, 69.51428571428572], [151.0, 7.2656370656370655], [153.0, 69.60000000000005], [155.0, 5.324400564174889], [157.0, 69.0], [159.0, 3.4590049053959295], [161.0, 68.0], [163.0, 4.648731744811685], [165.0, 1133.0], [167.0, 3.1667947732513473], [171.0, 3.8022965551672456], [173.0, 0.9285714285714285], [175.0, 1586.0], [177.0, 4.505291005291004], [179.0, 90.0], [181.0, 11.556338028169034], [185.0, 11.806286549707613], [187.0, 18.125], [189.0, 14.468181818181815], [191.0, 130.575], [193.0, 14.146643109540614], [195.0, 65.0], [197.0, 14.242236024844708], [201.0, 14.848124428179327], [203.0, 4.017857142857143], [205.0, 19.409141583054627], [207.0, 3.702127659574469], [209.0, 0.9710144927536231], [211.0, 95.74666666666667], [213.0, 40.165160230073944], [217.0, 11.986013986013997], [219.0, 66.0], [221.0, 17.981042654028442], [225.0, 14.611678832116752], [227.0, 69.0], [229.0, 18.06001558846452], [231.0, 34.02202643171806], [233.0, 20.042114695340516], [235.0, 9.632], [237.0, 29.224052718286696], [239.0, 6.5140032948929125], [241.0, 30.791095890410993], [243.0, 5.479527559055121], [245.0, 41.803680981595086], [247.0, 77.35714285714286], [249.0, 4.967659574468082], [251.0, 1160.5], [253.0, 5.162175404213617], [255.0, 76.59340659340661], [258.0, 14.90551181102362], [270.0, 5.4351687388987475], [262.0, 8.201570680628269], [266.0, 9.558620689655168], [274.0, 12.199019607843136], [278.0, 5.244546498277853], [286.0, 6.043575418994416], [282.0, 0.9097744360902255], [290.0, 6.198697068403905], [302.0, 8.100083402835693], [294.0, 9.807295796986516], [298.0, 6.589270008795082], [306.0, 6.247084548104953], [318.0, 0.890625], [310.0, 6.362388059701488], [314.0, 6.167076167076162], [334.0, 10.650289017341045], [326.0, 7.919191919191916], [330.0, 8.285156249999998], [338.0, 9.629629629629637], [342.0, 9.660676532769555], [350.0, 29.170256410256453], [346.0, 28.209824561403487], [354.0, 0.8461538461538461], [366.0, 76.0], [362.0, 70.0], [382.0, 8.029050279329601], [374.0, 412.6666666666667], [378.0, 342.21428571428567], [386.0, 7.793806030969852], [390.0, 0.9423076923076923], [398.0, 1170.6666666666665], [394.0, 1278.0], [414.0, 61.050847457627114], [406.0, 79.69629629629634], [402.0, 1928.3333333333333], [418.0, 11.920415224913498], [422.0, 13.922985781990528], [430.0, 1155.25], [426.0, 47.519480519480524], [434.0, 677.5], [442.0, 61.258585858585796], [450.0, 0.9454545454545454], [454.0, 2.4285714285714293], [462.0, 58.38686131386863], [458.0, 8.197440585009145], [466.0, 24.189887036040847], [470.0, 83.56375838926175], [478.0, 59.58404558404557], [474.0, 33.606367583212744], [482.0, 72.25581395348837], [486.0, 334.2857142857142], [494.0, 9.05339805825242], [490.0, 0.9230769230769229], [498.0, 87.87784431137736], [502.0, 50.79361179361175], [506.0, 23.364544319600494], [516.0, 10.615384615384627], [524.0, 12.268370607028757], [540.0, 11.014925373134323], [532.0, 0.8857142857142856], [548.0, 11.840073529411779], [556.0, 0.9655172413793107], [572.0, 317.3], [564.0, 48.230536659108076], [588.0, 18.916129032258066], [580.0, 56.912124582869865], [604.0, 11.038461538461538], [596.0, 2.376237623762377], [612.0, 72.57894736842107], [636.0, 11.774147727272707], [628.0, 1278.0], [644.0, 59.28322147651003], [652.0, 71.0], [660.0, 55.3678929765887], [668.0, 892.0], [684.0, 67.73333333333335], [676.0, 124.89583333333337], [692.0, 48.708812260536426], [700.0, 1.0], [708.0, 608.375], [716.0, 38.99511665762351], [732.0, 408.0], [724.0, 49.55451263537902], [748.0, 89.45179282868529], [740.0, 8.440677966101696], [764.0, 41.47944550669211], [756.0, 17.16962305986697], [780.0, 0.873015873015873], [772.0, 43.866840731070525], [796.0, 15.777777777777779], [788.0, 15.033666969972703], [804.0, 28.202833706189377], [812.0, 46.986615678776225], [828.0, 297.6363636363636], [820.0, 17.946808510638284], [844.0, 16.36477987421384], [836.0, 35.42000000000004], [860.0, 23.263888888888886], [852.0, 0.879310344827586], [876.0, 21.9748427672956], [868.0, 19.78290766208255], [892.0, 20.21951219512196], [884.0, 53.08921933085502], [908.0, 27.64204545454546], [900.0, 11.810810810810812], [924.0, 95.73985431841837], [916.0, 19.377049180327855], [932.0, 84.0], [940.0, 57.67893961708395], [956.0, 23.379120879120887], [948.0, 79.87155963302752], [988.0, 881.0], [1004.0, 103.56210526315789], [996.0, 91.4240077444337], [1020.0, 53.506116207951095], [1012.0, 53.07423580786028], [1032.0, 32.74501718213067], [1048.0, 283.16666666666663], [1080.0, 878.0], [1064.0, 878.5], [1112.0, 21.389705882352935], [1144.0, 37.3724023275145], [1128.0, 37.02698282910874], [1160.0, 62.237330037082835], [1192.0, 75.17857142857143], [1176.0, 61.51955671447192], [1240.0, 63.97276853252643], [1272.0, 115.34494773519164], [1256.0, 70.15710723192016], [1304.0, 95.29218362282887], [1288.0, 13.461538461538462], [1336.0, 13.67295597484277], [1320.0, 869.0], [1368.0, 1.0], [1352.0, 138.8717948717949], [1400.0, 63.56175595238086], [1384.0, 61.216519174041196], [1416.0, 78.39374325782079], [1432.0, 80.0], [1464.0, 73.7478991596638], [1448.0, 82.39381563593933], [1496.0, 83.88482238966627], [1480.0, 233.2898550724637], [1512.0, 91.42118537200516], [1560.0, 43.915816326530646], [1544.0, 85.55860446883567], [1592.0, 5.929411764705882], [1576.0, 207.45299145299148], [1624.0, 51.68962510897995], [1608.0, 62.40142348754449], [1656.0, 52.993174061433464], [1640.0, 78.66666666666666], [1688.0, 17.186991869918707], [1672.0, 146.6824817518246], [1720.0, 107.34896551724131], [1704.0, 138.48076923076925], [1752.0, 91.60625444207517], [1736.0, 107.8787878787879], [1784.0, 100.40677966101697], [1768.0, 129.12290502793292], [1800.0, 47.35009487666032], [1816.0, 428.0], [1848.0, 2.0], [1832.0, 88.67078825347761], [1864.0, 458.375], [1912.0, 131.21453287197224], [1880.0, 108.96758104738147], [1928.0, 65.53489889106326], [1944.0, 126.93333333333327], [1976.0, 61.66469002695419], [1960.0, 91.09364548494986], [1992.0, 96.96988322065143], [2008.0, 114.1288461538462], [2040.0, 22.738586156111925], [2024.0, 65.03016759776538], [2064.0, 67.87345563459385], [2096.0, 66.59358288770053], [2128.0, 123.55555555555557], [2224.0, 95.85378151260508], [2288.0, 266.1], [2320.0, 148.05223880596984], [2416.0, 126.5803366488145], [2352.0, 135.393521709166], [2448.0, 157.58802177858465], [2512.0, 161.75], [2544.0, 829.0], [2576.0, 101.89277108433726], [2672.0, 629.3333333333334], [2704.0, 98.08139534883725], [2736.0, 139.93515037594025], [2768.0, 182.4202682563338], [2800.0, 819.5], [2928.0, 187.18360408009053], [2896.0, 158.3906125696104], [2960.0, 273.0], [3056.0, 66.56752655538689], [3088.0, 612.0], [3120.0, 192.23858921161784], [3152.0, 177.8858773181171], [3184.0, 186.0], [3280.0, 175.33463338533508], [3408.0, 158.31690140845086], [3472.0, 245.26666666666668], [3568.0, 200.2801519468186], [3600.0, 196.615558912387], [3632.0, 239.89489489489503], [3696.0, 215.0], [3728.0, 166.41926345609053], [3760.0, 136.7164677804297], [3792.0, 424.0], [3856.0, 252.3312883435583], [3888.0, 357.1472452462215], [4016.0, 222.4310344827586], [4048.0, 171.41385435168743], [4080.0, 219.82542694497167], [4128.0, 180.07500000000024], [4256.0, 271.03101196953173], [4384.0, 109.38256484149836], [4448.0, 380.6666666666667], [4576.0, 264.62466367712955], [4704.0, 101.62735166425473], [4768.0, 314.62439807383686], [4832.0, 266.5], [4896.0, 296.1816770186335], [5088.0, 398.77884615384625], [5216.0, 259.51238304898214], [5344.0, 521.0], [5280.0, 1246.0], [5152.0, 1250.0], [5408.0, 448.1518151815184], [5536.0, 336.8339483394836], [5600.0, 1240.0], [5792.0, 115.94771241830068], [5856.0, 159.35125698324012], [5728.0, 1239.0], [5664.0, 1240.0], [5920.0, 628.0], [6048.0, 242.8542857142859], [6112.0, 565.9479166666657], [6176.0, 545.0], [6240.0, 126.0], [6304.0, 265.034675169391], [6432.0, 384.3962264150943], [6496.0, 710.4597107438008], [6624.0, 1220.0], [6688.0, 573.8608996539797], [6752.0, 576.3333333333333], [6816.0, 1009.75], [6880.0, 1063.0], [7008.0, 715.6184501845006], [7072.0, 187.60606060606045], [7136.0, 414.3333333333333], [6944.0, 1214.0], [7200.0, 141.3070259865255], [7264.0, 427.08613989637223], [7328.0, 222.24670433145022], [7392.0, 824.1204819277111], [7584.0, 917.0], [7648.0, 917.7371841155233], [7520.0, 1043.0], [7456.0, 1045.3333333333333], [7712.0, 539.0], [7776.0, 634.5], [7840.0, 1038.0], [8096.0, 667.1558086560357], [8160.0, 1032.0], [8032.0, 1035.0], [7968.0, 1037.0], [8384.0, 1028.5], [8256.0, 1031.0], [8768.0, 809.7395944503733], [8896.0, 1090.1714285714281], [9280.0, 462.0], [9408.0, 588.7663107947793], [9536.0, 757.9144981412641], [9664.0, 688.9594137542283], [9920.0, 862.5288461538462], [8259.0, 331.85400000000004], [8387.0, 173.8913043478261], [8643.0, 402.1494937462779], [8515.0, 1164.481481481482], [8899.0, 700.6], [9155.0, 571.2227351413732], [8771.0, 1018.3333333333333], [9283.0, 683.4063926940642], [9539.0, 716.046794871794], [9667.0, 1226.1897233201585], [9411.0, 441.0], [9795.0, 658.0735694822888], [9923.0, 396.3333333333333], [4129.0, 115.22722029988468], [4193.0, 384.0], [4321.0, 218.19078947368433], [4449.0, 333.94661067786456], [4513.0, 512.0], [4577.0, 270.9848484848483], [4641.0, 231.48694316436283], [4769.0, 141.28949478748982], [4833.0, 503.186507936508], [4705.0, 1259.0], [4897.0, 1158.0], [4961.0, 227.3877370974853], [5089.0, 415.6284201235667], [5281.0, 257.288888888889], [5345.0, 1245.0], [5153.0, 1249.0], [5409.0, 348.82002129925434], [5473.0, 556.0840455840461], [5537.0, 509.6666666666667], [5601.0, 110.49032258064499], [5665.0, 439.642857142857], [5729.0, 284.44497607655484], [5857.0, 108.92534562211985], [5921.0, 374.048048048047], [5985.0, 853.2], [6049.0, 952.4], [6113.0, 155.66571428571416], [6177.0, 420.72568578553637], [6369.0, 1225.0], [6241.0, 1227.0], [6497.0, 177.9169288860919], [6561.0, 269.0], [6625.0, 1220.0], [6753.0, 283.7064393939394], [6881.0, 1181.0], [6817.0, 1217.0], [6689.0, 1218.0], [7137.0, 487.74497991967945], [6945.0, 1214.0], [7201.0, 240.0], [7265.0, 547.6035805626598], [7329.0, 195.4616122840695], [7393.0, 502.6405063291145], [7457.0, 525.443535188216], [7649.0, 129.83839479392637], [7585.0, 1042.0], [7713.0, 454.614261884904], [7777.0, 799.9270833333339], [7841.0, 731.2], [8033.0, 574.7015285599368], [8097.0, 325.6640000000001], [8161.0, 1032.0], [8258.0, 227.50131371518614], [8386.0, 785.3333333333334], [8642.0, 503.49806201550354], [8898.0, 100.03167420814482], [9026.0, 229.15469061876252], [9154.0, 586.5982758620689], [9282.0, 470.00471920717314], [9666.0, 417.8333333333333], [9538.0, 429.0], [9410.0, 437.0], [9794.0, 552.4999999999998], [9922.0, 786.4652406417108], [8389.0, 417.0], [8517.0, 1025.4], [8773.0, 687.0427493713336], [8901.0, 272.11639676113333], [9029.0, 312.8687572590008], [9413.0, 895.21483375959], [9669.0, 160.06297709923666], [9285.0, 439.5], [9925.0, 796.3572984749433], [2097.0, 86.94922425952046], [2129.0, 92.23139653414879], [2065.0, 845.0], [2193.0, 123.62049861495852], [2257.0, 70.02354260089683], [2289.0, 75.75], [2321.0, 148.7095435684648], [2353.0, 13.208232445520576], [2449.0, 116.18009168303848], [2545.0, 829.0], [2609.0, 189.91031073446328], [2641.0, 215.71351351351353], [2673.0, 255.0], [2737.0, 115.97540983606568], [2769.0, 138.6329760081671], [2801.0, 154.15602263540816], [2897.0, 124.99764982373665], [2929.0, 849.0], [2865.0, 818.0], [2833.0, 842.0], [2961.0, 271.875], [2993.0, 266.6], [3025.0, 175.0], [3057.0, 21.812500000000004], [3121.0, 115.05315614617945], [3153.0, 191.10706278026862], [3185.0, 185.6159769008663], [3281.0, 243.0], [3313.0, 179.7696835908757], [3345.0, 100.80482897384312], [3441.0, 189.5765983112184], [3473.0, 308.9094412331409], [3505.0, 204.25605900948372], [3569.0, 1072.5], [3601.0, 200.03648424543948], [3633.0, 308.4656308851223], [3793.0, 381.19883040935656], [3825.0, 234.7692307692308], [3857.0, 108.0], [3889.0, 326.17135549872114], [3921.0, 161.5750469043149], [4049.0, 81.50716981132076], [4081.0, 245.42144638403957], [4130.0, 185.0], [4194.0, 212.79721669980137], [4258.0, 512.0], [4322.0, 240.4242021276594], [4450.0, 165.49380165289227], [4514.0, 485.8029556650247], [4642.0, 264.09927495817055], [4834.0, 464.5220338983053], [4962.0, 102.69879518072293], [5026.0, 213.21747885622287], [5090.0, 1250.0], [5154.0, 209.89750328515132], [5282.0, 237.85007649158584], [5474.0, 284.26800216567403], [5666.0, 328.39289145052834], [5730.0, 497.3574986164916], [5794.0, 118.0], [5858.0, 73.70588235294117], [5922.0, 123.92076502732255], [5986.0, 206.6474916387961], [6114.0, 244.0], [6050.0, 1233.0], [6178.0, 295.37804878048723], [6242.0, 221.61904761904756], [6370.0, 673.1819354838713], [6498.0, 248.0], [6562.0, 273.09356725146205], [6754.0, 430.77314814814804], [6818.0, 720.0149892933622], [6882.0, 356.20707070707056], [6690.0, 1218.0], [7074.0, 750.5513812154705], [7138.0, 615.8585209003229], [7010.0, 1056.5], [6946.0, 1214.0], [7202.0, 240.0], [7266.0, 780.0], [7394.0, 229.0], [7458.0, 652.9063063063074], [7522.0, 268.97368421052636], [7650.0, 110.0], [7586.0, 2412.0], [7714.0, 746.4347826086953], [7778.0, 855.6557640750676], [7842.0, 531.8596663395482], [7906.0, 833.2083906464917], [7970.0, 518.6805555555547], [8034.0, 831.3594515181194], [8162.0, 748.8393223819303], [8388.0, 210.26082862523506], [8644.0, 895.5], [9028.0, 504.5], [9156.0, 938.8666666666667], [9412.0, 799.0], [9540.0, 1080.8253358925147], [9668.0, 161.82176656151452], [9796.0, 600.25], [9924.0, 1119.6767676767674], [8263.0, 513.4646781789643], [8391.0, 245.5925925925929], [8647.0, 917.6409826912343], [8775.0, 597.0], [8903.0, 482.0], [9159.0, 670.0902896081759], [9287.0, 677.9023836549368], [9415.0, 612.0], [9543.0, 1074.038004750595], [9799.0, 813.9709241952221], [4195.0, 109.34963099630997], [4323.0, 19.0], [4387.0, 181.0457796852645], [4515.0, 247.12521968365576], [4643.0, 431.0], [4707.0, 222.16524216524212], [4835.0, 220.8254364089769], [4771.0, 1257.0], [5027.0, 276.42564102564097], [5155.0, 152.1746987951807], [5283.0, 281.7134831460677], [5347.0, 530.894909688013], [5219.0, 1248.0], [5411.0, 564.0], [5731.0, 558.1530054644808], [5795.0, 213.1050679851669], [5859.0, 204.0], [5923.0, 929.3333333333334], [5987.0, 257.60882352941144], [6051.0, 565.9406354515048], [6243.0, 324.8828541001064], [6371.0, 319.3883984867589], [6307.0, 1226.0], [6435.0, 429.0630914826493], [6563.0, 216.41312741312737], [6627.0, 792.7015926236379], [6755.0, 506.0], [6819.0, 134.35778985507255], [6883.0, 448.6572709801408], [6691.0, 1219.5], [6947.0, 267.8257303946693], [7075.0, 605.1592592592599], [7139.0, 1052.0], [7203.0, 215.57072771872447], [7331.0, 1047.0], [7267.0, 1049.5], [7459.0, 698.0], [7523.0, 218.95556805399337], [7587.0, 803.200819672131], [7715.0, 990.6], [7779.0, 146.22448979591832], [7843.0, 659.5312500000006], [7907.0, 205.59879518072313], [7971.0, 602.325708061002], [8099.0, 355.0196292257358], [8163.0, 830.2222222222216], [8262.0, 495.8161258603737], [8390.0, 417.0], [8646.0, 784.3180592991914], [8518.0, 1705.5], [8774.0, 133.44266917293245], [8902.0, 281.4034722222219], [9030.0, 486.90157211209856], [9158.0, 989.7149321266965], [9286.0, 723.189309576837], [9414.0, 1003.6494464944649], [9670.0, 401.7142857142857], [9926.0, 128.6800894854587], [8265.0, 726.6086956521739], [8649.0, 1022.0], [8777.0, 257.68743509865004], [8905.0, 442.9877049180329], [9033.0, 738.4030418250949], [9161.0, 604.0], [9417.0, 698.3987341772151], [9545.0, 1060.2727272727275], [9673.0, 296.8357446808509], [9289.0, 440.3333333333333], [9801.0, 943.0], [9929.0, 238.1149128469982], [1081.0, 54.642857142857146], [1049.0, 173.36893203883494], [1065.0, 878.0], [1097.0, 75.0], [1113.0, 29.539877300613497], [1129.0, 340.6666666666667], [1145.0, 875.0], [1177.0, 49.98499999999999], [1161.0, 27.178104575163403], [1209.0, 83.50576606260292], [1193.0, 53.21636564688534], [1225.0, 55.7609467455621], [1241.0, 90.5], [1273.0, 113.78528225806458], [1257.0, 26.71586715867157], [1305.0, 66.79294117647056], [1289.0, 70.70370370370371], [1337.0, 1.166666666666667], [1321.0, 90.1695501730104], [1353.0, 67.38230088495581], [1401.0, 13.894444444444444], [1385.0, 47.4], [1369.0, 125.29834710743803], [1433.0, 74.78294573643406], [1417.0, 60.72359154929572], [1465.0, 71.07284768211917], [1449.0, 865.0], [1497.0, 32.262135922330096], [1481.0, 86.0], [1529.0, 55.20641711229944], [1513.0, 98.93307086614186], [1545.0, 1.1111111111111114], [1593.0, 71.65269461077841], [1577.0, 318.0], [1561.0, 89.47707100591713], [1625.0, 66.99999999999999], [1609.0, 89.99704724409443], [1657.0, 3.0], [1641.0, 62.538873994638124], [1689.0, 71.40105890138977], [1721.0, 85.0], [1705.0, 4.0], [1673.0, 857.0], [1737.0, 99.57295373665482], [1753.0, 155.27235772357722], [1785.0, 120.7116883116883], [1769.0, 113.55072463768114], [1801.0, 80.64238410596033], [1817.0, 78.15801354401809], [1849.0, 45.84263959390866], [1833.0, 79.54336734693877], [1865.0, 74.2050604229608], [1881.0, 7.31111111111111], [1897.0, 85.44463593278749], [1913.0, 850.5], [1929.0, 79.09909909909902], [1945.0, 122.3076923076923], [1977.0, 116.14808917197475], [1961.0, 5.5], [1993.0, 148.04724409448826], [2009.0, 102.75247524752479], [2041.0, 20.421897810218972], [2025.0, 58.07073588134619], [2066.0, 684.0], [2098.0, 127.48631578947371], [2130.0, 114.79349593495938], [2194.0, 111.16546184738947], [2290.0, 89.7877249653899], [2258.0, 109.7052505966588], [2226.0, 840.0], [2322.0, 247.208121827411], [2354.0, 15.14285714285714], [2386.0, 834.0], [2450.0, 142.0], [2482.0, 171.23590982286618], [2514.0, 152.76751854905163], [2674.0, 177.44730856709626], [2610.0, 120.63468309859155], [2642.0, 136.51825127334456], [2706.0, 632.1666666666666], [2738.0, 533.75], [2802.0, 125.91654135338337], [2834.0, 164.4125000000002], [2930.0, 849.5], [2962.0, 165.0196000000003], [2994.0, 190.69256594724231], [3026.0, 179.6190476190474], [3090.0, 126.0], [3186.0, 184.80901856763947], [3218.0, 204.77756653992398], [3314.0, 174.5193321616871], [3346.0, 85.33354192740937], [3410.0, 247.0], [3474.0, 169.61581920903959], [3506.0, 153.6365348399245], [3634.0, 111.7027027027027], [3666.0, 186.04672131147566], [3698.0, 332.6970108695652], [3794.0, 296.88253968253895], [3826.0, 348.2298136645963], [3922.0, 97.32406822488927], [3954.0, 270.11657481983946], [3986.0, 323.43181818181813], [4018.0, 508.0], [4050.0, 102.48221906116638], [4132.0, 296.8912386706948], [4260.0, 229.1096654275097], [4388.0, 270.5326016785027], [4516.0, 134.56081081081078], [4580.0, 417.28741092636585], [4708.0, 324.01569365976127], [4836.0, 1254.5], [4772.0, 1257.5555555555557], [4900.0, 369.10681719496273], [4964.0, 676.5], [5028.0, 1008.6666666666666], [5156.0, 290.8143459915614], [5220.0, 380.5313145216797], [5348.0, 351.4364130434782], [5284.0, 1246.25], [5412.0, 198.8262711864403], [5540.0, 482.89455946076134], [5604.0, 1240.0], [5668.0, 550.0], [5796.0, 242.18487891317156], [5860.0, 198.67150837988817], [5988.0, 100.0], [6052.0, 433.7135593220334], [6116.0, 268.0], [5924.0, 1237.0], [6180.0, 324.79999999999995], [6244.0, 382.8290816326527], [6308.0, 376.74429771908757], [6372.0, 1225.0], [6436.0, 454.9600840336142], [6628.0, 143.58800922367422], [6564.0, 1220.5], [6500.0, 1223.0], [6692.0, 537.6518375241785], [6820.0, 214.0], [6884.0, 1320.7777777777778], [6948.0, 340.32505175983414], [7012.0, 808.7136986301374], [7204.0, 295.93103448275883], [7268.0, 574.2337917485272], [7332.0, 459.1034482758621], [7396.0, 253.0], [7524.0, 322.1179883945843], [7588.0, 417.1395202020204], [7652.0, 220.10309278350513], [7460.0, 1045.0], [7908.0, 642.875], [7972.0, 793.0], [8100.0, 22.027713625866014], [8392.0, 276.6533888228301], [8648.0, 1022.0], [8520.0, 1707.0], [8264.0, 1713.0], [8904.0, 291.5], [9160.0, 1129.0], [9032.0, 1011.0], [9288.0, 947.7567567567569], [9544.0, 1098.009887936716], [9672.0, 266.12002840909054], [9800.0, 983.0675965665235], [9928.0, 396.42857142857144], [8267.0, 682.099082568807], [8395.0, 336.10326086956496], [8651.0, 692.7417417417424], [8779.0, 733.1666666666666], [8907.0, 512.6517571884986], [9035.0, 848.5857142857136], [9163.0, 143.90835140997837], [9291.0, 770.4049445865306], [9419.0, 132.53962900505908], [9675.0, 419.5], [9547.0, 431.0], [4133.0, 327.1894189891357], [4197.0, 241.0], [4261.0, 193.28790786948178], [4389.0, 321.46625766871165], [4581.0, 123.06622516556315], [4709.0, 301.17687074829934], [4773.0, 282.7336956521739], [4837.0, 1255.6666666666667], [4901.0, 267.2537313432836], [4965.0, 443.1955587392546], [5093.0, 744.2855691056913], [5029.0, 1252.0], [5221.0, 207.59683794466412], [5285.0, 582.0], [5413.0, 89.76283367556465], [5541.0, 164.85972850678743], [5605.0, 313.4173100365705], [5477.0, 1243.0], [5861.0, 257.3726666666667], [5797.0, 1237.0], [5733.0, 1239.0], [5669.0, 1240.0], [5989.0, 1116.3333333333335], [6117.0, 330.8587105624141], [5925.0, 1237.0], [6181.0, 656.5625], [6245.0, 419.21739130434776], [6309.0, 415.97283638660764], [6437.0, 801.0], [6501.0, 227.01272264631038], [6565.0, 96.5], [6693.0, 173.38599105812227], [6757.0, 548.2755364806873], [6885.0, 762.0], [7013.0, 170.87514188422242], [7077.0, 1040.6666666666667], [7205.0, 502.0], [7269.0, 463.87055555555634], [7333.0, 533.2041420118346], [7397.0, 422.58471074380174], [7525.0, 906.0], [7653.0, 258.086956521739], [7589.0, 2412.0], [7461.0, 1045.0], [7717.0, 523.5188253012049], [7909.0, 524.0], [7845.0, 1038.0], [7781.0, 1039.0], [8165.0, 831.0], [8037.0, 1035.0], [8394.0, 798.0], [8650.0, 1034.5], [8266.0, 1031.0], [8778.0, 277.8161875945541], [8906.0, 458.3705991352687], [9034.0, 821.5002794857461], [9162.0, 967.2975352112674], [9290.0, 1069.0], [9418.0, 407.1776556776554], [9674.0, 420.5], [9930.0, 288.8189655172415], [9802.0, 412.0], [8269.0, 897.0], [8653.0, 756.3333333333334], [9037.0, 1048.0], [9165.0, 92.0], [8909.0, 1014.0], [9549.0, 93.4478688524591], [9677.0, 461.4491525423727], [9293.0, 438.6666666666667], [9805.0, 337.39333333333286], [9933.0, 393.3121301775152], [2067.0, 180.11458333333343], [2163.0, 171.13681592039794], [2131.0, 32.125], [2291.0, 140.03542673107899], [2227.0, 235.03265306122464], [2259.0, 153.0], [2195.0, 842.0], [2323.0, 45.5], [2355.0, 45.76470588235294], [2387.0, 115.34256926952138], [2419.0, 833.0], [2547.0, 142.69106511862745], [2483.0, 115.16556291390734], [2515.0, 120.114705882353], [2451.0, 832.0], [2579.0, 185.04000000000008], [2643.0, 257.0], [2675.0, 111.11861614497523], [2707.0, 166.0657439446366], [2739.0, 821.0], [2835.0, 126.13418903150513], [2931.0, 258.0], [2867.0, 151.84515366430244], [2899.0, 247.0], [2995.0, 97.76299376299382], [3027.0, 83.36655948553071], [3059.0, 123.75413139862943], [3091.0, 285.9838107098384], [3219.0, 179.89377112506037], [3251.0, 183.70902036857402], [3283.0, 212.2466793168883], [3347.0, 132.43772893772888], [3379.0, 279.42574257425724], [3411.0, 270.72151898734177], [3539.0, 180.51509054325973], [3571.0, 342.2216216216217], [3603.0, 291.0], [3635.0, 414.6], [3667.0, 111.98113207547168], [3699.0, 274.1100397050486], [3731.0, 307.10416666666663], [3827.0, 382.0304536979485], [3859.0, 142.9369715603383], [3955.0, 208.4096385542169], [3987.0, 199.27146946564883], [4019.0, 266.91561938958637], [4051.0, 223.0], [4198.0, 166.0743405275781], [4326.0, 347.90699461952397], [4454.0, 367.752301622095], [4582.0, 150.84098939929336], [4646.0, 391.2064323111442], [4774.0, 437.7755681818184], [4966.0, 132.61343804537498], [5030.0, 235.4696245733791], [5094.0, 190.03818615751746], [5414.0, 92.20576923076928], [5478.0, 308.32092426187444], [5606.0, 288.33333333333337], [5670.0, 203.02258635961024], [5734.0, 365.92307692307713], [5862.0, 431.0785714285716], [5926.0, 278.7655172413799], [5990.0, 367.98292422625406], [6118.0, 121.0], [6182.0, 397.1550032701105], [6246.0, 347.3333333333333], [6310.0, 1226.0], [6438.0, 723.0], [6502.0, 372.5602693602701], [6566.0, 391.0], [6758.0, 730.1942909760601], [6822.0, 189.0192307692309], [6886.0, 607.5628742514972], [7014.0, 468.6666666666667], [7078.0, 637.8908145580605], [7142.0, 906.7837837837837], [7206.0, 539.5], [7270.0, 192.5], [7398.0, 319.4408099688467], [7334.0, 1048.0], [7462.0, 904.0563380281686], [7526.0, 1044.5], [7718.0, 738.6222222222228], [7782.0, 199.6492942453853], [7910.0, 292.95909090909106], [7846.0, 1038.0], [8038.0, 123.4002954209748], [8102.0, 173.52050473186122], [8268.0, 666.3843008994274], [8396.0, 364.65249343832], [8652.0, 165.04294478527612], [8908.0, 732.0], [9164.0, 601.0], [9036.0, 1283.2], [9292.0, 329.54186413902113], [9548.0, 141.73591253153924], [9676.0, 396.4876632801159], [9804.0, 1120.6122098022358], [8271.0, 236.36486486486507], [8399.0, 598.7583547557847], [8655.0, 228.30208333333331], [8783.0, 689.9495073891628], [8911.0, 578.4592476489023], [9039.0, 247.75744308231157], [9167.0, 300.00287356321763], [9295.0, 156.94430051813458], [9423.0, 373.60012836970566], [9679.0, 549.0], [9935.0, 495.6666666666667], [9807.0, 1367.5], [4135.0, 26.0], [4199.0, 261.59626436781593], [4263.0, 393.5], [4327.0, 98.97126436781589], [4391.0, 525.0], [4455.0, 170.00000000000006], [4519.0, 342.6989795918368], [4647.0, 156.00692041522507], [4711.0, 541.9732620320857], [4839.0, 269.89306511381653], [4775.0, 1256.3333333333333], [5031.0, 123.74525139664783], [5095.0, 1250.0], [5159.0, 478.3646616541356], [5287.0, 410.7427075542261], [5479.0, 354.8460937499998], [5415.0, 1244.0], [5671.0, 243.4022988505747], [5735.0, 151.65668202764996], [5799.0, 430.25], [5863.0, 723.0], [5991.0, 362.70306923625975], [6119.0, 767.0], [6055.0, 1234.0], [6183.0, 123.23655913978483], [6375.0, 215.02796052631572], [6439.0, 682.1538461538461], [6567.0, 524.6274617067838], [6631.0, 742.5], [6503.0, 1222.3333333333333], [6823.0, 291.4816933638436], [6887.0, 546.6713836477983], [6951.0, 409.7028493894168], [7079.0, 81.36185383244195], [7143.0, 778.8599871547847], [7015.0, 1056.0], [7207.0, 457.21573948439635], [7399.0, 487.0], [7463.0, 398.53433476394775], [7527.0, 634.1877133105811], [7591.0, 1015.0], [7655.0, 1042.0], [7783.0, 287.7204030226698], [7847.0, 834.7951635846374], [7911.0, 305.9664041994747], [7975.0, 832.3350970017635], [8039.0, 103.52017937219725], [8103.0, 367.9889400921651], [8167.0, 520.282655246253], [8398.0, 714.5714285714286], [8654.0, 1022.0], [8782.0, 528.1826923076922], [8910.0, 597.8151629072674], [9038.0, 1081.7499999999986], [9166.0, 211.01333333333335], [9422.0, 242.55054811205858], [9550.0, 218.75], [9294.0, 439.5], [9806.0, 248.0], [9934.0, 579.1176119402985], [8401.0, 987.038626609442], [8657.0, 372.3242574257427], [9169.0, 439.0], [8785.0, 1018.0], [9553.0, 369.14563617245034], [9681.0, 912.6484224082426], [9809.0, 185.10549777117373], [525.0, 13.050203527815466], [541.0, 71.5], [533.0, 103.75516224188787], [557.0, 0.9259259259259259], [573.0, 51.2415966386554], [565.0, 9.856105610561071], [589.0, 58.8251121076233], [581.0, 10.041860465116283], [605.0, 63.510053619303065], [597.0, 0.9666666666666667], [613.0, 37.963235294117624], [621.0, 48.31843065693433], [637.0, 138.07692307692307], [629.0, 0.8749999999999999], [645.0, 20.265855221012153], [653.0, 47.667489711934195], [669.0, 2.8658536585365852], [661.0, 25.12992125984252], [685.0, 24.27891504605939], [677.0, 67.64390896921024], [693.0, 62.049645390070935], [701.0, 44.337226277372245], [717.0, 16.59378468368481], [709.0, 0.8881578947368421], [733.0, 31.68290909090898], [725.0, 19.549450549450547], [749.0, 18.1579754601227], [741.0, 0.9999999999999999], [765.0, 15.398009950248753], [757.0, 15.148083623693378], [781.0, 5.710382513661202], [773.0, 19.469672131147526], [789.0, 28.170212765957448], [797.0, 888.0], [813.0, 41.23889668069195], [805.0, 30.30041152263374], [829.0, 57.326194398681984], [845.0, 19.691275167785236], [837.0, 18.849999999999998], [861.0, 73.0], [853.0, 0.8993288590604022], [877.0, 27.52941176470588], [869.0, 51.90226460071515], [885.0, 44.15885714285711], [909.0, 63.28865979381444], [901.0, 80.41666666666666], [925.0, 104.92417061611381], [917.0, 883.0], [933.0, 57.0728417266187], [941.0, 72.3456614509247], [957.0, 61.55172413793103], [973.0, 378.375], [965.0, 64.89032697547687], [989.0, 59.21104536489151], [981.0, 54.18139097744366], [1005.0, 124.68122270742359], [997.0, 60.04073789392782], [1021.0, 57.01486199575372], [1013.0, 66.53710937499996], [1050.0, 39.33613766730413], [1082.0, 60.5677387914231], [1066.0, 202.0998439937596], [1034.0, 879.25], [1114.0, 394.2], [1098.0, 62.67924528301889], [1146.0, 76.0], [1130.0, 876.0], [1210.0, 75.8070469798658], [1178.0, 24.65957446808511], [1194.0, 292.75], [1226.0, 64.57142857142864], [1274.0, 41.31950207468879], [1258.0, 77.0], [1242.0, 872.0], [1290.0, 63.865546218487424], [1306.0, 23.000000000000004], [1338.0, 1.2999999999999998], [1322.0, 63.70755170755175], [1370.0, 76.25597269624578], [1354.0, 31.06235565819861], [1402.0, 30.16666666666667], [1386.0, 54.05271317829463], [1418.0, 26.30263157894737], [1434.0, 66.50322580645157], [1466.0, 45.30769230769231], [1450.0, 56.80338266384777], [1498.0, 1.2777777777777781], [1482.0, 65.92849162011167], [1530.0, 80.19191919191921], [1514.0, 98.37348538845373], [1562.0, 48.958724202626655], [1546.0, 1.137931034482759], [1578.0, 114.47645429362862], [1626.0, 90.00413793103439], [1610.0, 46.64093959731546], [1658.0, 59.45460277427495], [1642.0, 74.94982613015408], [1690.0, 101.1452991452991], [1674.0, 54.795798319327744], [1722.0, 51.942164179104445], [1706.0, 38.201277955271564], [1754.0, 150.80882352941174], [1738.0, 3.0], [1786.0, 2.0], [1770.0, 65.11453744493383], [1802.0, 118.63311451495254], [1850.0, 69.0160528800755], [1818.0, 2.0], [1834.0, 82.38178913738018], [1866.0, 83.68217054263566], [1882.0, 49.0521091811415], [1914.0, 57.21808510638302], [1898.0, 104.43243243243242], [1930.0, 158.63341645885288], [1978.0, 61.255230125523], [1946.0, 570.0], [1962.0, 5.657142857142857], [1994.0, 137.73170731707324], [2042.0, 336.0], [2010.0, 7.63888888888889], [2026.0, 1.4814814814814812], [2068.0, 128.03686274509815], [2100.0, 107.86378519973813], [2164.0, 105.22125084061886], [2132.0, 62.928143712574844], [2228.0, 117.41755319148947], [2260.0, 27.5], [2292.0, 838.0], [2324.0, 122.57508833922269], [2356.0, 102.44040968342641], [2420.0, 171.96425211665084], [2388.0, 833.5], [2452.0, 331.57142857142856], [2548.0, 107.62380952380944], [2484.0, 834.0], [2580.0, 166.9138349514562], [2644.0, 824.0], [2708.0, 139.60743602124566], [2740.0, 161.12752858399324], [2804.0, 105.0], [2868.0, 141.34282460136706], [2900.0, 240.86016949152534], [2932.0, 262.45762711864415], [3028.0, 70.76080691642649], [3060.0, 119.82661290322575], [3092.0, 197.83176593521432], [3156.0, 111.0], [3252.0, 165.258181818182], [3284.0, 179.01386861313875], [3348.0, 372.5], [3380.0, 189.19117647058843], [3412.0, 174.27796775769426], [3476.0, 246.0], [3540.0, 197.46987951807233], [3572.0, 91.23139312977122], [3604.0, 383.3979238754325], [3732.0, 144.95467160037035], [3764.0, 414.5], [3860.0, 114.99850523168905], [4020.0, 96.25189263592557], [4200.0, 511.0], [4392.0, 351.00984528832635], [4520.0, 296.08143651997983], [4648.0, 142.21428571428572], [4712.0, 540.2769784172662], [4840.0, 365.3262711864403], [4776.0, 1257.0], [4904.0, 204.70717423133217], [4968.0, 1253.0], [5160.0, 363.2136550912303], [5288.0, 304.1488326848251], [5352.0, 234.62574850299384], [5480.0, 370.09854014598545], [5544.0, 335.5698924731182], [5608.0, 1240.3333333333333], [5416.0, 1244.0], [5800.0, 537.0246252676673], [5864.0, 1237.0], [5736.0, 1239.0], [5928.0, 643.0], [5992.0, 407.1648351648351], [6056.0, 188.3437229437231], [6184.0, 123.0], [6248.0, 489.2693069306932], [6376.0, 531.3333333333334], [6440.0, 497.2032710280374], [6504.0, 797.625], [6568.0, 585.5969162995597], [6632.0, 205.3204819277109], [6824.0, 375.73178807947033], [6888.0, 137.546875], [6696.0, 1218.3333333333333], [6952.0, 472.5427135678387], [7144.0, 179.1911764705882], [7016.0, 1056.3333333333333], [7208.0, 684.4766483516486], [7272.0, 244.82978723404258], [7528.0, 789.9794801641591], [7592.0, 352.03846153846183], [7464.0, 1045.5], [7720.0, 64.0], [7784.0, 520.0], [7848.0, 423.81840193704596], [7912.0, 684.6666666666666], [7976.0, 267.83940042826555], [8040.0, 146.5], [8104.0, 272.68874172185434], [8168.0, 158.38372093023239], [8272.0, 100.0866972477064], [8400.0, 703.9746258946012], [8656.0, 200.3759854457247], [8784.0, 835.25], [9040.0, 103.0], [9168.0, 219.78723404255314], [9296.0, 173.0309446254072], [9424.0, 500.0], [9552.0, 429.3194888178913], [9680.0, 712.819852941176], [9808.0, 289.9999999999999], [9936.0, 326.0], [8403.0, 1072.0], [8531.0, 852.1], [8659.0, 616.6493506493507], [8787.0, 839.8729559748434], [8915.0, 321.99559147685596], [9043.0, 94.83509933774852], [9171.0, 775.4818840579711], [9299.0, 554.6983842010768], [9427.0, 385.03817991631786], [9683.0, 420.0], [9555.0, 427.0], [9811.0, 470.5], [9939.0, 791.3628652214883], [4137.0, 275.5538057742782], [4265.0, 384.16291854072944], [4329.0, 230.0], [4393.0, 108.09632224168122], [4457.0, 279.0], [4585.0, 376.4352159468436], [4713.0, 190.8236083165662], [4777.0, 533.04], [4649.0, 1260.5], [4905.0, 199.66738894907897], [4969.0, 179.7996219281662], [5033.0, 84.5], [5161.0, 240.0], [5225.0, 171.52394366197166], [5353.0, 245.54973821989498], [5417.0, 300.2383241758243], [5481.0, 111.0], [5545.0, 284.73858199217136], [5609.0, 678.382575757576], [5673.0, 821.8], [5801.0, 149.02961275626444], [5865.0, 532.7349397590358], [5993.0, 667.0], [6121.0, 645.8778565799846], [6057.0, 1232.0], [5929.0, 1236.5], [6249.0, 575.871098265896], [6313.0, 695.6116027531966], [6185.0, 1229.0], [6441.0, 90.01405622489962], [6569.0, 1142.4285714285713], [6633.0, 266.1928799149845], [6697.0, 220.2165538781885], [6889.0, 1215.5], [6825.0, 1217.0], [6953.0, 787.0], [7017.0, 257.56433703461784], [7081.0, 95.33333333333326], [7209.0, 791.0], [7273.0, 188.14673629242813], [7337.0, 799.2057613168729], [7529.0, 798.0], [7593.0, 246.39687137891082], [7657.0, 334.5424242424244], [7721.0, 241.37943262411346], [7849.0, 1038.5], [7785.0, 1040.0], [8105.0, 857.3333333333334], [8169.0, 1032.0], [8530.0, 1025.5], [8914.0, 1077.6721470019334], [9042.0, 122.49043303121881], [9170.0, 276.41993957703943], [9426.0, 439.7346938775509], [9554.0, 447.0], [9682.0, 1124.0], [9298.0, 439.6666666666667], [9810.0, 265.06629834254136], [9938.0, 682.3152866242042], [8277.0, 508.10682492581606], [8405.0, 243.2491373360937], [8661.0, 325.5687361419064], [8789.0, 1034.8], [9045.0, 1011.0], [9429.0, 483.16666666666663], [9557.0, 633.4140127388519], [9685.0, 1149.2002085505715], [9813.0, 380.7805044308114], [9941.0, 235.8], [2101.0, 52.13268608414237], [2133.0, 52.989399293286205], [2293.0, 69.66666666666667], [2229.0, 149.35148514851494], [2261.0, 49.38562091503267], [2197.0, 840.0], [2325.0, 136.60406091370567], [2357.0, 103.69804287045672], [2421.0, 102.4471744471744], [2389.0, 833.75], [2453.0, 132.41320553780633], [2549.0, 234.0], [2517.0, 543.5], [2581.0, 112.19941986947067], [2613.0, 159.20420420420422], [2741.0, 144.82538569424963], [2773.0, 206.47345612134356], [2837.0, 241.0], [2901.0, 158.83124539425216], [2933.0, 159.8569903948777], [2997.0, 247.0], [3061.0, 470.0], [3125.0, 187.57578601595506], [3157.0, 153.61440677966115], [3221.0, 112.0], [3285.0, 131.44221879815095], [3413.0, 185.25974025974023], [3445.0, 201.58470525756758], [3477.0, 185.5536028119506], [3541.0, 263.08240534521167], [3573.0, 96.85185185185179], [3605.0, 115.71633600675376], [3637.0, 137.26337115072926], [3733.0, 252.32608695652172], [3765.0, 295.3796339746593], [3861.0, 203.5], [3893.0, 202.61090761090787], [3925.0, 307.1095008051533], [3989.0, 203.0], [4085.0, 470.9333333333333], [4021.0, 225.0], [4053.0, 298.4391824526415], [4138.0, 107.19851231985123], [4266.0, 203.09863945578243], [4330.0, 246.0], [4522.0, 524.0], [4586.0, 313.0898305084743], [4650.0, 269.0], [4778.0, 316.8106402164109], [4842.0, 1107.4], [4906.0, 204.83882783882788], [4970.0, 235.11538461538447], [5034.0, 186.94979919678698], [5098.0, 254.71028037383175], [5226.0, 413.5261324041815], [5162.0, 1249.0], [5418.0, 257.4565217391303], [5482.0, 111.0], [5610.0, 504.33217592592575], [5546.0, 1242.0], [5738.0, 262.5], [5866.0, 528.5956937799044], [5674.0, 1239.0], [5930.0, 500.8856304985332], [5994.0, 579.15859030837], [6122.0, 316.90445168295275], [6058.0, 1233.0], [6186.0, 401.9900497512437], [6314.0, 163.63550135501345], [6506.0, 667.5325977933808], [6698.0, 209.34193548387103], [6762.0, 357.1913133402277], [6890.0, 1169.0], [6826.0, 1217.0], [6954.0, 787.0], [7018.0, 280.9800443458976], [7082.0, 63.64303904923605], [7274.0, 289.9176470588232], [7338.0, 387.34515819750777], [7402.0, 628.8245067497406], [7466.0, 537.0], [7594.0, 524.0], [7658.0, 380.13023255813954], [7722.0, 96.40128755364809], [7914.0, 528.0], [7850.0, 1039.0], [7786.0, 1040.5], [8042.0, 129.5770992366412], [8170.0, 249.0], [8276.0, 409.91171060698935], [8404.0, 1088.7688172043017], [8660.0, 570.3371126228265], [8532.0, 1803.5714285714287], [8788.0, 981.8092643051776], [9172.0, 609.7828746177374], [9044.0, 1011.0], [9300.0, 392.4751412429371], [9428.0, 484.10108303249115], [9940.0, 255.28571428571428], [9812.0, 411.25], [8535.0, 906.7], [8663.0, 1022.0], [8791.0, 1139.8353808353797], [8919.0, 289.7807070101858], [9047.0, 91.73604060913706], [9175.0, 523.7160194174761], [9303.0, 764.6822916666671], [9431.0, 614.6701484332048], [9559.0, 736.6666666666666], [9687.0, 381.25], [9815.0, 527.7142857142858], [9943.0, 1187.0723047127176], [4203.0, 363.95846394984375], [4331.0, 334.4173859432797], [4459.0, 237.2057747051647], [4651.0, 189.59459459459464], [4779.0, 195.4519685039372], [4843.0, 372.3330618892507], [4971.0, 294.9270568278202], [5035.0, 136.65806451612895], [5099.0, 250.66954177897605], [4907.0, 1255.0], [5291.0, 177.2927113702622], [5355.0, 540.0], [5483.0, 348.62956313584664], [5547.0, 284.0], [5611.0, 909.6666666666666], [5675.0, 391.1033123028381], [5739.0, 257.39473684210526], [5931.0, 452.88036480686674], [5995.0, 112.66404199475066], [6187.0, 470.3917662682604], [6251.0, 714.6666666666667], [6315.0, 379.0], [6379.0, 421.3758389261743], [6507.0, 606.2432659932657], [6635.0, 515.0], [6571.0, 1220.0], [6699.0, 686.25], [6763.0, 138.18352513628093], [6827.0, 596.1700542005419], [6891.0, 189.80209545983706], [6955.0, 801.582191780822], [7147.0, 281.0], [7083.0, 1053.0], [7019.0, 1055.5], [7339.0, 242.0], [7403.0, 720.6992417860154], [7467.0, 196.26349431818178], [7595.0, 523.0], [7659.0, 641.0], [7787.0, 424.28610603290684], [7851.0, 276.0], [7915.0, 446.2171787709498], [7723.0, 1041.0], [7979.0, 221.21146245059282], [8043.0, 88.08225108225106], [8107.0, 627.5255060728749], [8278.0, 650.0], [8406.0, 182.72872340425533], [8534.0, 939.703125], [8662.0, 730.2727272727273], [8918.0, 238.0], [9046.0, 125.41663149008023], [8790.0, 1018.3333333333334], [9558.0, 747.0911949685535], [9686.0, 1143.9424083769625], [9430.0, 435.3333333333333], [9814.0, 426.8875968992247], [9942.0, 1042.4110169491528], [8281.0, 797.2566257272135], [8409.0, 118.02427821522315], [8537.0, 1044.8333333333333], [8665.0, 755.4024390243907], [8793.0, 190.84033613445382], [8921.0, 476.0], [9049.0, 419.13575129533734], [9177.0, 662.6666666666666], [9305.0, 924.8083333333334], [9433.0, 883.25], [9561.0, 902.6778523489938], [9689.0, 418.75], [9817.0, 746.561272217025], [9945.0, 241.33333333333334], [1035.0, 124.52291105121297], [1083.0, 24.300309597523217], [1067.0, 72.69070512820515], [1099.0, 55.90361445783134], [1115.0, 53.671501706484605], [1147.0, 62.2437431991295], [1131.0, 57.97565922920896], [1163.0, 61.16932907348244], [1211.0, 22.144251626898047], [1195.0, 11.048387096774194], [1227.0, 50.24251497006004], [1243.0, 55.7791388270229], [1275.0, 610.3333333333334], [1259.0, 68.41860465116262], [1291.0, 47.650326797385596], [1339.0, 66.87292817679561], [1323.0, 45.67857142857142], [1307.0, 869.75], [1355.0, 69.912244897959], [1371.0, 12.801268498942932], [1403.0, 88.0], [1387.0, 72.19206145966716], [1435.0, 35.106557377049185], [1467.0, 84.75473933649288], [1451.0, 82.90562036055157], [1419.0, 865.0], [1499.0, 66.5729442970822], [1483.0, 76.57867132867123], [1531.0, 79.51871657754012], [1515.0, 10.65934065934066], [1547.0, 88.7828877005347], [1595.0, 61.23914699162215], [1579.0, 78.19645494830121], [1563.0, 6.911764705882352], [1611.0, 4.068965517241379], [1659.0, 112.38752362948964], [1627.0, 858.4285714285714], [1691.0, 242.05714285714282], [1675.0, 83.57227722772284], [1723.0, 77.60126582278478], [1707.0, 78.95581171950062], [1755.0, 5.0476190476190474], [1739.0, 72.55841226883186], [1787.0, 56.12654867256645], [1771.0, 78.5167652859961], [1803.0, 7.724137931034483], [1851.0, 128.76722817764164], [1819.0, 60.19158878504674], [1835.0, 55.33333333333333], [1915.0, 91.20284697508895], [1883.0, 73.61088295687878], [1899.0, 126.07917888563053], [1867.0, 852.0], [1931.0, 127.63157894736844], [1947.0, 68.18983402489621], [1979.0, 90.62546125461267], [1963.0, 56.018214936247716], [1995.0, 122.46249999999996], [2011.0, 42.8125], [2043.0, 100.88795518207282], [2027.0, 26.12794117647064], [2102.0, 5.919540229885058], [2134.0, 80.2400398406375], [2198.0, 126.36679536679527], [2294.0, 76.51755725190837], [2262.0, 58.48148148148153], [2230.0, 839.0], [2326.0, 121.98936170212761], [2358.0, 160.58267716535434], [2422.0, 834.0], [2390.0, 833.5], [2454.0, 86.6106321839081], [2486.0, 145.7320359281437], [2550.0, 234.0], [2614.0, 116.17978142076491], [2646.0, 176.70267489711935], [2774.0, 129.9673008323423], [2806.0, 182.1866666666668], [2838.0, 235.9924670433146], [2902.0, 119.5679012345678], [2934.0, 150.28776978417255], [2998.0, 173.03482045701844], [2966.0, 199.01033057851234], [3030.0, 85.44002789400278], [3126.0, 124.0755102040816], [3158.0, 169.71718061674008], [3190.0, 183.82292432035274], [3254.0, 239.0], [3318.0, 130.07902163687672], [3286.0, 254.0], [3350.0, 308.9880450070322], [3414.0, 251.0], [3446.0, 134.98475609756102], [3478.0, 177.01925925925906], [3510.0, 200.22651222651206], [3574.0, 1072.5], [3638.0, 98.5664739884392], [3670.0, 201.3736153071501], [3734.0, 388.0], [3766.0, 225.78629032258058], [3798.0, 224.29855537720695], [3830.0, 233.66666666666666], [3894.0, 63.230769230769226], [3926.0, 294.5363175675673], [3958.0, 269.12486883525713], [4054.0, 426.154958677686], [4086.0, 141.32908813041217], [4204.0, 122.61860129776503], [4268.0, 121.0], [4332.0, 296.6486146095719], [4524.0, 244.87357859531807], [4588.0, 516.0], [4652.0, 317.17355371900766], [4716.0, 208.9807692307693], [4780.0, 102.15789473684214], [4844.0, 152.01892744479514], [5100.0, 270.54687499999983], [5164.0, 249.31752873563227], [5228.0, 853.0], [5292.0, 192.71116225546632], [5420.0, 613.25], [5484.0, 130.6484458735261], [5612.0, 1240.0], [5676.0, 650.0], [5740.0, 299.5651955867605], [5804.0, 262.3215130023641], [5868.0, 776.0], [5932.0, 933.6], [5996.0, 131.82986536107708], [6060.0, 598.1219512195129], [6188.0, 597.2986111111107], [6252.0, 874.7472885032538], [6316.0, 379.0], [6380.0, 435.3163265306119], [6444.0, 263.67741935483934], [6572.0, 441.1308116627258], [6636.0, 530.6000000000001], [6508.0, 1222.0], [6828.0, 665.1638655462182], [6892.0, 304.4512855209751], [6764.0, 1217.0], [6700.0, 1218.0], [6956.0, 608.5837104072393], [7084.0, 257.82156133829], [7148.0, 216.12994093593815], [7212.0, 829.8391959798993], [7404.0, 779.0], [7468.0, 231.95778611632272], [7532.0, 660.6329113924048], [7788.0, 565.5630630630632], [7852.0, 195.36357481381194], [7916.0, 729.6875000000006], [7980.0, 212.82276843467005], [8108.0, 741.0875656742552], [8172.0, 329.3975506358924], [8408.0, 208.0], [8664.0, 547.0604606525901], [8536.0, 1025.0], [8792.0, 529.2409420289857], [8920.0, 378.15178571428606], [9048.0, 441.0], [9176.0, 421.38479087452464], [9304.0, 821.2756160830095], [9432.0, 935.6125000000008], [9944.0, 870.8], [9816.0, 411.5], [8283.0, 933.0], [8411.0, 558.1], [8539.0, 1095.9298245614034], [8923.0, 439.15996649916224], [9051.0, 275.0], [9179.0, 858.2601431980905], [9435.0, 1071.5009523809535], [9563.0, 1098.1967213114754], [9691.0, 312.68281938326], [9819.0, 3400.0], [9947.0, 337.5195288282701], [4333.0, 318.5], [4397.0, 259.68467852257146], [4525.0, 142.4268953068591], [4589.0, 456.9206008583692], [4717.0, 236.44215820759035], [4781.0, 100.0], [4909.0, 449.9362059317294], [4973.0, 885.0], [5037.0, 462.0621468926555], [5101.0, 783.75], [5165.0, 340.82117163412136], [5229.0, 560.3086172344692], [5293.0, 359.0], [5357.0, 545.7797783933515], [5421.0, 656.4042918454927], [5485.0, 230.0], [5549.0, 498.82671480144415], [5613.0, 1240.0], [5677.0, 414.0], [5741.0, 371.38104838709705], [5805.0, 296.7797546012273], [5869.0, 1236.5], [5997.0, 1220.6666666666667], [6061.0, 493.80716080402016], [6125.0, 284.0], [6189.0, 639.0], [6253.0, 138.69311797752823], [6317.0, 610.25], [6445.0, 315.115894039735], [6573.0, 163.8976818545165], [6637.0, 691.625249500998], [6701.0, 549.0492182976254], [6893.0, 781.9999999999999], [6829.0, 1217.3333333333333], [6957.0, 142.46927374301674], [7021.0, 649.2190871369293], [7085.0, 115.25558312655085], [7149.0, 430.58], [7213.0, 542.3152757442653], [7277.0, 452.5641025641025], [7341.0, 188.0789473684209], [7405.0, 1046.0], [7533.0, 198.37487636003985], [7597.0, 618.5045045045055], [7661.0, 744.6765217391302], [7725.0, 712.5], [7789.0, 932.25], [7853.0, 239.33706606942883], [7917.0, 1038.0], [8045.0, 135.00732153752264], [8173.0, 102.2790697674419], [7981.0, 1041.0], [8282.0, 829.5133437990575], [8410.0, 236.73487903225808], [8538.0, 847.0], [8666.0, 812.0], [9050.0, 99.53212199870218], [9178.0, 601.6666666666666], [8922.0, 1015.6666666666666], [9306.0, 630.6666666666666], [9562.0, 996.2031948881772], [9690.0, 261.21387283236913], [9818.0, 862.2656794425095], [9946.0, 241.0], [8413.0, 289.73647984267427], [8541.0, 1158.3658536585365], [8669.0, 516.0495565988527], [8797.0, 334.7030000000007], [9053.0, 164.4324873096444], [9181.0, 1224.0], [9309.0, 764.8229665071779], [9693.0, 417.5], [9949.0, 229.0], [9821.0, 412.0], [2071.0, 68.74695001967731], [2167.0, 110.85060103033776], [2135.0, 117.55102040816324], [2199.0, 93.88641686182673], [2295.0, 132.96246973365618], [2263.0, 96.65876375952567], [2231.0, 840.0], [2327.0, 10.0], [2359.0, 836.0], [2487.0, 114.10835214446962], [2519.0, 192.39832869080763], [2551.0, 221.5303030303031], [2679.0, 189.99008868022958], [2615.0, 124.16666666666666], [2647.0, 121.44573643410877], [2711.0, 197.86235955056205], [2743.0, 625.6666666666666], [2775.0, 592.5000000000001], [2807.0, 121.53262316910791], [2839.0, 152.2170841361594], [2871.0, 203.16341030195363], [2903.0, 574.6666666666666], [2967.0, 137.2641815235008], [2999.0, 182.5049226441628], [3031.0, 78.21594684385381], [3063.0, 194.4944209311275], [3191.0, 158.73931623931622], [3223.0, 185.45132325141773], [3255.0, 184.41551246537398], [3319.0, 136.2540272614623], [3351.0, 198.5186567164178], [3447.0, 107.0], [3479.0, 162.22905982905982], [3511.0, 121.61388286334066], [3543.0, 88.39050131926126], [3607.0, 219.0], [3671.0, 196.99609120521143], [3703.0, 136.88868013151716], [3799.0, 206.88104291146084], [3927.0, 513.0], [3959.0, 113.716010165184], [3991.0, 244.06775067750647], [4023.0, 242.81249999999997], [4142.0, 246.82674571804998], [4270.0, 186.6183274021355], [4334.0, 519.0], [4398.0, 286.59183673469374], [4462.0, 408.0], [4590.0, 149.88941299790352], [4782.0, 187.07030223390288], [4846.0, 231.0], [4910.0, 135.21384615384613], [4974.0, 528.0536277602529], [5038.0, 41.23356807511733], [5102.0, 1251.0], [5230.0, 448.0755502676991], [5358.0, 295.1820263308533], [5294.0, 1246.0], [5422.0, 408.25382262996965], [5486.0, 736.5], [5550.0, 316.1188016528923], [5614.0, 243.67505241090163], [5742.0, 377.33333333333337], [5806.0, 319.6503496503496], [5870.0, 238.4133273300315], [6062.0, 37.0], [6126.0, 237.1069958847737], [6254.0, 228.5], [6318.0, 399.7813163481952], [6382.0, 638.5], [6446.0, 853.0], [6574.0, 250.0], [6638.0, 724.2500000000001], [6702.0, 700.9348268839105], [6766.0, 257.4623655913977], [6894.0, 1088.3333333333333], [6830.0, 1217.0], [7022.0, 649.2459485224022], [6958.0, 2446.5], [7278.0, 356.34234234234196], [7342.0, 269.9797630799597], [7406.0, 1047.0], [7534.0, 123.0], [7598.0, 729.0153846153851], [7662.0, 755.8023809523821], [7726.0, 333.71172122492135], [8046.0, 80.43830207305018], [8174.0, 662.3529411764705], [7982.0, 1037.0], [8284.0, 933.0], [8540.0, 1391.25], [8412.0, 1028.0], [8796.0, 271.41990119971797], [8924.0, 650.0808080808079], [9052.0, 255.62053571428606], [9180.0, 1163.1923335574963], [9308.0, 1034.9881422924898], [9436.0, 178.3209408194235], [9692.0, 418.0], [9948.0, 90.83127962085321], [9820.0, 412.0], [8287.0, 168.40938722294632], [8415.0, 618.0], [8671.0, 1022.0], [8927.0, 759.3315602836877], [9055.0, 928.3333333333334], [9183.0, 1192.8933333333332], [8799.0, 1017.0], [9311.0, 270.0], [9567.0, 656.357675111774], [9695.0, 539.1557262569826], [9823.0, 457.3709949409778], [9951.0, 339.4683870967742], [4143.0, 321.0264765784113], [4271.0, 185.23618090452268], [4335.0, 531.8805309734519], [4463.0, 267.78624260355076], [4591.0, 122.56573705179281], [4783.0, 285.34200000000016], [4847.0, 753.5], [4719.0, 1258.0], [4911.0, 580.5], [4975.0, 197.95365853658544], [5103.0, 497.780269058296], [5039.0, 1252.0], [5231.0, 156.86842105263156], [5295.0, 1246.0], [5167.0, 1249.0], [5423.0, 126.33617021276594], [5551.0, 127.4456193353475], [5615.0, 248.4539521392314], [5487.0, 1243.0], [5679.0, 447.6081218274106], [5743.0, 1036.0], [5807.0, 327.0], [5871.0, 111.69483568075123], [5935.0, 193.06769825918744], [5999.0, 310.78592814371274], [6063.0, 122.0], [6127.0, 265.3963806187982], [6191.0, 710.1490299823636], [6319.0, 487.28354725787665], [6383.0, 690.7133333333344], [6447.0, 909.6], [6511.0, 213.34254807692298], [6639.0, 1001.0], [6767.0, 255.93717277486897], [6895.0, 296.06666666666666], [7087.0, 1054.3333333333333], [6959.0, 1088.0], [7279.0, 97.0], [7343.0, 233.26470588235298], [7407.0, 470.48384673178066], [7471.0, 531.5375426621156], [7535.0, 261.0], [7663.0, 1497.3333333333333], [7727.0, 364.30360531309356], [7791.0, 826.3224489795927], [7919.0, 821.4945355191262], [7983.0, 524.3882352941173], [8047.0, 549.0], [8111.0, 1033.0], [8286.0, 878.5600522193214], [8414.0, 328.77808032675335], [8670.0, 149.328165374677], [8926.0, 779.75], [9054.0, 758.75], [9182.0, 917.5], [9566.0, 1351.1920634920637], [9694.0, 552.4689578713968], [9438.0, 433.5], [9310.0, 926.0], [9822.0, 1121.5749128919858], [9950.0, 231.0], [8417.0, 819.7911877394641], [8545.0, 1448.6666666666667], [8673.0, 226.52247191011259], [8289.0, 2393.5], [8801.0, 669.6458204334351], [8929.0, 1011.0], [9057.0, 987.0], [9185.0, 181.3774703557312], [9313.0, 182.8106332138592], [9441.0, 343.9275534441804], [9569.0, 363.6666666666667], [9697.0, 417.8333333333333], [9825.0, 342.0], [9953.0, 434.25], [271.0, 50.090909090909086], [267.0, 796.6666666666666], [259.0, 1587.0], [275.0, 33.79069767441861], [279.0, 0.9560439560439563], [283.0, 0.0], [303.0, 72.0], [299.0, 2249.0], [291.0, 2250.0], [307.0, 8.386503067484664], [319.0, 24.092783505154635], [315.0, 13.826229508196722], [311.0, 2251.0], [323.0, 71.0], [335.0, 72.25000000000001], [331.0, 72.66666666666667], [327.0, 2257.0], [339.0, 1.0], [343.0, 19.737864077669904], [351.0, 8.1150061500615], [347.0, 6.750000000000005], [355.0, 0.8924050632911387], [359.0, 33.52650176678446], [367.0, 70.16666666666667], [363.0, 55.381930184804894], [371.0, 61.02499999999998], [383.0, 4.344827586206898], [375.0, 70.5], [379.0, 1.3004926108374375], [387.0, 14.087318087318089], [391.0, 71.79671717171723], [399.0, 20.149282296650735], [395.0, 48.81651376146788], [403.0, 28.268456375838927], [415.0, 59.298701298701296], [407.0, 38.92025316455695], [411.0, 30.318715740015687], [419.0, 38.4375], [423.0, 109.51282051282051], [431.0, 23.961959654178653], [427.0, 10.137529137529135], [435.0, 20.390512494705632], [439.0, 25.443595769682712], [447.0, 23.626518753301593], [443.0, 12.586762075134201], [451.0, 278.7931034482759], [455.0, 205.8181818181818], [463.0, 9.339041095890414], [459.0, 0.8928571428571427], [467.0, 27.371727748691097], [471.0, 19.365728900255757], [479.0, 14.279909706546263], [475.0, 9.322147651006714], [483.0, 25.64401294498382], [487.0, 44.96078431372549], [495.0, 0.9012345679012347], [491.0, 48.7360248447205], [499.0, 12.34818941504177], [503.0, 11.491317671092938], [511.0, 22.54010889292195], [507.0, 11.456807187284024], [542.0, 31.067010309278352], [534.0, 101.45], [518.0, 2249.0], [558.0, 57.796610169491494], [550.0, 52.475409836065566], [574.0, 11.521181716833874], [566.0, 34.400000000000006], [590.0, 58.93412162162158], [582.0, 11.604316546762586], [606.0, 14.35684647302905], [598.0, 67.23318872017353], [614.0, 12.369863013698641], [622.0, 12.517647058823554], [638.0, 19.893617021276597], [630.0, 60.448919449901744], [646.0, 15.789592760180996], [654.0, 13.39968528717545], [670.0, 42.889557135046495], [662.0, 13.684742647058814], [678.0, 17.805439330543937], [686.0, 22.798206278026896], [694.0, 13.98927203065135], [702.0, 34.274999999999984], [710.0, 0.8636363636363636], [718.0, 200.57142857142856], [726.0, 15.561124694376526], [750.0, 50.0], [742.0, 44.51204281891167], [758.0, 37.5], [782.0, 52.09615384615384], [774.0, 19.309090909090905], [798.0, 46.70999999999998], [790.0, 482.0], [814.0, 8.748427672955978], [830.0, 39.99298245614032], [822.0, 44.33399405351835], [806.0, 888.0], [838.0, 54.30519480519481], [862.0, 59.705710102489], [854.0, 92.89517241379313], [870.0, 58.86595174262737], [878.0, 49.08424908424911], [894.0, 50.49495515695073], [886.0, 2.2769230769230764], [910.0, 56.09583333333336], [902.0, 56.95708712613784], [926.0, 71.38235294117648], [918.0, 17.72067039106145], [934.0, 31.101736972704742], [942.0, 22.609656301145684], [958.0, 0.8461538461538463], [950.0, 55.776374442793475], [966.0, 19.879019908116394], [974.0, 48.46448087431691], [990.0, 76.78159851301129], [982.0, 36.69101796407187], [998.0, 32.57142857142857], [1006.0, 23.27036770007209], [1022.0, 22.208297320656865], [1014.0, 51.8950749464668], [1036.0, 38.00958605664481], [1052.0, 115.0], [1068.0, 54.535353535353536], [1100.0, 28.120418848167503], [1116.0, 42.894736842105154], [1148.0, 48.76329442282747], [1132.0, 20.52557544757031], [1180.0, 65.3755868544601], [1164.0, 53.743401759530805], [1196.0, 40.739247311827945], [1276.0, 55.41715116279068], [1260.0, 44.3469387755102], [1308.0, 65.25194494314778], [1340.0, 101.00175953079196], [1324.0, 605.8333333333334], [1356.0, 82.71428571428572], [1372.0, 23.39256198347109], [1404.0, 68.8914488258751], [1388.0, 60.47463175122753], [1420.0, 64.91547464239278], [1436.0, 1.109090909090909], [1468.0, 105.79262672811068], [1452.0, 69.36956521739128], [1500.0, 69.63340471092067], [1484.0, 58.2086438152012], [1516.0, 88.5], [1548.0, 140.232283464567], [1564.0, 1.0], [1596.0, 63.21875], [1580.0, 28.970129870129874], [1612.0, 14.32258064516129], [1628.0, 62.73744292237443], [1660.0, 90.41318977119788], [1644.0, 59.9550938337802], [1692.0, 214.7826086956522], [1676.0, 2.0], [1724.0, 86.0714285714286], [1708.0, 44.44957983193279], [1756.0, 77.60973782771526], [1740.0, 123.95850622406635], [1788.0, 73.28487804878041], [1772.0, 81.81075268817204], [1804.0, 103.43589743589742], [1820.0, 65.31043523859476], [1852.0, 180.1914893617021], [1868.0, 41.216438356164375], [1916.0, 201.0646258503402], [1884.0, 87.78156996587028], [1900.0, 52.2051282051282], [1932.0, 68.3903712296983], [1948.0, 128.35960591132994], [1980.0, 92.8864142538975], [1964.0, 103.23323076923084], [1996.0, 67.2759124087591], [2012.0, 87.56713856713849], [2044.0, 75.07138934651289], [2028.0, 20.458791208791197], [2072.0, 44.12307692307691], [2104.0, 83.38104448742743], [2168.0, 101.3103448275862], [2136.0, 137.1877022653721], [2232.0, 277.69333333333344], [2296.0, 145.1238938053097], [2264.0, 133.52514619883053], [2200.0, 840.0], [2328.0, 77.57377049180333], [2360.0, 19.28571428571429], [2392.0, 284.15730337078645], [2520.0, 99.8920491273432], [2552.0, 124.92199906585682], [2488.0, 831.0], [2584.0, 178.42387543252585], [2648.0, 89.55555555555554], [2680.0, 103.73824451410657], [2616.0, 825.2], [2712.0, 113.88066666666666], [2744.0, 198.1016129032258], [2776.0, 239.0], [2840.0, 104.15180265654655], [2872.0, 142.29923150816546], [2904.0, 226.1688888888889], [3000.0, 150.73461538461535], [3032.0, 192.0], [2968.0, 849.0], [3096.0, 441.6223776223775], [3160.0, 103.0], [3224.0, 105.58840579710143], [3256.0, 169.87171561051025], [3288.0, 229.07200000000003], [3352.0, 177.5], [3384.0, 218.05758017492735], [3416.0, 194.59548254620114], [3544.0, 102.5582822085889], [3576.0, 333.07491582491514], [3704.0, 93.61303462321801], [3736.0, 407.4256444150697], [3832.0, 194.54708994708977], [3864.0, 370.3443708609271], [3928.0, 538.0], [3992.0, 112.57956989247303], [4024.0, 261.4833984375], [4208.0, 300.593297791317], [4336.0, 181.8960165545784], [4464.0, 98.39348370927328], [4592.0, 1012.5], [4656.0, 244.31540084388226], [4848.0, 175.59751773049658], [4784.0, 1257.0], [5040.0, 772.0], [5104.0, 169.6353276353279], [5296.0, 497.67128916281433], [5232.0, 1247.0], [5488.0, 260.8650662251651], [5616.0, 584.0], [5552.0, 1242.0], [5424.0, 1244.0], [5680.0, 145.04014869888496], [5744.0, 521.8146622734758], [6000.0, 327.64952487423176], [6064.0, 1234.5], [5936.0, 1236.0], [6192.0, 391.8929961089495], [6384.0, 142.24119482835474], [6256.0, 1227.0], [6512.0, 250.90221642764], [6576.0, 1030.8], [6448.0, 1223.0], [6768.0, 391.63571428571424], [6832.0, 332.6862429605794], [6896.0, 432.8492101483965], [6960.0, 209.12435233160622], [7088.0, 154.89823245848953], [7152.0, 463.98900523560235], [7216.0, 942.5], [7280.0, 535.3333333333333], [7344.0, 893.75], [7408.0, 113.69133574007212], [7472.0, 666.715155203896], [7600.0, 1043.0], [7536.0, 1044.0], [7792.0, 538.5664939550954], [7856.0, 546.695829094608], [7920.0, 544.9313380281695], [7728.0, 1041.0], [7984.0, 571.5773657288997], [8048.0, 203.42338709677406], [8112.0, 911.6903225806448], [8176.0, 549.6017094017088], [8544.0, 1449.0], [8288.0, 1031.0], [8800.0, 685.0659186535769], [8928.0, 1127.973140495868], [9056.0, 213.86464723926375], [9184.0, 889.748623853211], [9312.0, 281.19512195121956], [9440.0, 253.54596888260252], [9568.0, 214.94864048338366], [9696.0, 770.0], [9824.0, 171.0], [9952.0, 380.91090342679115], [8291.0, 358.0707358813463], [8547.0, 1250.8571428571427], [8675.0, 934.6666666666666], [8931.0, 1013.9701492537314], [9059.0, 202.16380297823576], [9187.0, 601.0], [9571.0, 209.28276699029124], [9699.0, 795.2311746987947], [9443.0, 433.5], [9827.0, 231.53206069505597], [9955.0, 685.0350877192982], [4209.0, 300.70409051348963], [4337.0, 174.2344632768361], [4401.0, 502.2420749279539], [4529.0, 433.0426703372333], [4657.0, 114.64644970414196], [4721.0, 529.5149253731344], [4849.0, 311.9180327868853], [4785.0, 1256.0], [4913.0, 230.93749999999994], [5041.0, 65.66089778258527], [5105.0, 1250.5], [5169.0, 341.5616613418534], [5297.0, 338.90769230769195], [5233.0, 1247.0], [5489.0, 528.5], [5553.0, 236.0], [5617.0, 1241.0], [5425.0, 1244.0], [5745.0, 575.8671874999999], [5809.0, 512.1039861351819], [6001.0, 1018.3333333333334], [6065.0, 195.3522415370542], [6129.0, 552.0], [5937.0, 1236.0], [6257.0, 406.9626769626769], [6385.0, 137.99999999999997], [6321.0, 1226.0], [6449.0, 584.0844720496892], [6513.0, 527.5], [6577.0, 283.1742367833213], [6641.0, 776.8198198198197], [6705.0, 816.236434108527], [6833.0, 153.46745152354598], [6897.0, 217.3248407643312], [6961.0, 250.10160919540243], [7089.0, 193.36721311475418], [7153.0, 659.303672316384], [7025.0, 1056.0], [7217.0, 192.71262886597933], [7409.0, 167.0], [7345.0, 1047.0], [7537.0, 207.23911781775982], [7665.0, 270.0], [7473.0, 1043.0], [7793.0, 232.0], [7857.0, 646.095458044649], [7921.0, 267.3561151079137], [7985.0, 718.5584415584416], [8049.0, 108.7443324937026], [8113.0, 1278.2131147540974], [8177.0, 918.0811403508774], [8418.0, 491.7899207248016], [8546.0, 1160.5], [8674.0, 320.44093178036593], [8290.0, 1485.0], [8802.0, 784.1428571428572], [9058.0, 525.5], [9186.0, 551.8], [9314.0, 255.1332398316969], [9442.0, 705.5], [9570.0, 429.0], [9826.0, 271.0], [9954.0, 390.0], [8549.0, 696.7391304347826], [8805.0, 894.0078125000016], [8933.0, 213.81310211946058], [9061.0, 3.0], [9189.0, 335.2085769980502], [9317.0, 703.2597014925375], [9445.0, 540.0047923322687], [9701.0, 415.8], [9829.0, 442.3333333333333], [9957.0, 556.7200956937805], [2073.0, 332.8], [2169.0, 102.33978234582828], [2105.0, 146.8008898776418], [2137.0, 843.0], [2233.0, 136.37520938023442], [2265.0, 43.476608187134495], [2297.0, 152.2217573221757], [2201.0, 840.0], [2329.0, 131.81835937499991], [2425.0, 132.9567747298421], [2361.0, 50.437788018433174], [2393.0, 110.89098073555175], [2457.0, 142.73804100227824], [2553.0, 23.0], [2585.0, 125.75444596443243], [2681.0, 825.0], [2713.0, 126.35405405405407], [2745.0, 138.8248551191241], [2905.0, 166.30283353010606], [2937.0, 849.875], [2841.0, 822.8333333333334], [3065.0, 927.75], [3001.0, 848.5], [2969.0, 849.0], [3097.0, 204.0273972602737], [3129.0, 206.82124352331599], [3161.0, 209.22500000000005], [3257.0, 166.9100459619174], [3289.0, 172.3120890237733], [3321.0, 388.0], [3385.0, 142.39818181818163], [3417.0, 199.74539282250208], [3449.0, 196.66666666666669], [3577.0, 291.3731343283578], [3513.0, 383.0], [3545.0, 125.32861806311207], [3609.0, 331.5754601227004], [3673.0, 107.0], [3737.0, 144.24038461538464], [3801.0, 199.00000000000003], [3833.0, 177.73109243697496], [3865.0, 267.92390405293634], [3897.0, 280.0], [3961.0, 223.66666666666666], [4025.0, 385.2924281984332], [4146.0, 540.7058823529411], [4274.0, 278.7149321266969], [4402.0, 196.80321507760468], [4466.0, 190.33333333333334], [4530.0, 308.16780821917797], [4594.0, 260.53274559193966], [4722.0, 246.62555066079304], [4786.0, 508.5375722543352], [4914.0, 224.76411815812307], [5042.0, 41.47188264058681], [5106.0, 1250.0], [5170.0, 174.73593570608506], [5362.0, 260.23645104895087], [5234.0, 1248.0], [5426.0, 247.7784431137727], [5554.0, 201.38797504254123], [5618.0, 540.0], [5810.0, 350.50596782563656], [5874.0, 301.0937231298367], [5746.0, 1238.5], [5938.0, 242.0], [6002.0, 105.0], [6066.0, 278.9770114942528], [6130.0, 545.1410256410254], [6258.0, 343.69841269841237], [6386.0, 887.3333333333334], [6450.0, 615.9769119769122], [6578.0, 295.6451282051277], [6642.0, 280.26392373306527], [6706.0, 507.0040840140027], [6898.0, 745.0], [6834.0, 1216.5], [6962.0, 496.0], [7026.0, 456.60090497737565], [7154.0, 30.0], [7218.0, 322.7235221674872], [7282.0, 784.1099041533546], [7346.0, 538.1663947797718], [7410.0, 1046.0], [7538.0, 276.7968992248063], [7602.0, 875.3555555555546], [7666.0, 228.51827242524942], [7474.0, 1387.5], [7922.0, 1037.3333333333333], [7794.0, 1039.0], [8114.0, 1291.0], [8178.0, 1032.0], [8292.0, 228.368595041322], [8548.0, 1265.4285714285716], [8676.0, 500.0], [8420.0, 1027.0], [8804.0, 809.5], [8932.0, 716.0440140845092], [9060.0, 114.99647058823523], [9188.0, 374.0324074074074], [9444.0, 399.1446673706445], [9572.0, 293.08559113300447], [9700.0, 876.3333333333331], [9828.0, 337.20165745856366], [9956.0, 450.30320855615], [8295.0, 588.5798525798531], [8423.0, 1000.9356014580808], [8551.0, 1556.7491207502933], [8679.0, 436.89910496338507], [9063.0, 151.7726190476192], [9191.0, 641.5], [9575.0, 532.126728110599], [9831.0, 593.8823529411764], [9959.0, 343.1111111111111], [4147.0, 219.76258351893063], [4275.0, 114.39636819035707], [4403.0, 146.80416666666665], [4467.0, 157.45680628272254], [4595.0, 353.7707349966286], [4787.0, 347.2918994413415], [4723.0, 1258.0], [4659.0, 1261.0], [4915.0, 385.42500000000024], [4979.0, 199.57980456026067], [5107.0, 1250.0], [5235.0, 360.06666666666695], [5363.0, 373.20930232558135], [5299.0, 1246.0], [5427.0, 271.0529236022192], [5555.0, 294.21220930232556], [5619.0, 353.97906819716394], [5747.0, 66.5], [5875.0, 413.90816326530614], [5811.0, 1237.0], [5939.0, 262.46296296296293], [6131.0, 412.4495210022108], [6195.0, 281.0], [6259.0, 562.2], [6323.0, 567.642023346303], [6387.0, 1224.6666666666667], [6451.0, 720.864864864865], [6515.0, 584.2857142857143], [6643.0, 117.7799511002445], [6579.0, 1220.0], [6707.0, 209.635], [6771.0, 653.1628624305988], [6899.0, 1060.0], [6835.0, 1216.0], [7027.0, 160.07674418604634], [7091.0, 478.57228017883733], [7283.0, 759.7722473604823], [7347.0, 613.583021223471], [7411.0, 182.2531969309465], [7219.0, 1051.0], [7539.0, 617.6666666666666], [7603.0, 198.28484320557496], [7667.0, 205.89614101953313], [7731.0, 740.0699881376025], [7795.0, 182.48325358851685], [7923.0, 1037.0], [8051.0, 222.16742424242378], [8115.0, 1034.0], [8422.0, 568.7040816326529], [8550.0, 1266.2857142857142], [8678.0, 395.66497461928924], [8806.0, 958.9971949509124], [8934.0, 229.66666666666666], [9062.0, 249.11067635550606], [9190.0, 247.127659574468], [9318.0, 664.5976863753215], [9446.0, 667.0], [9702.0, 414.6666666666667], [9958.0, 391.0], [8553.0, 3413.0], [8681.0, 1021.0], [8297.0, 2394.0], [8937.0, 417.1651319828113], [9065.0, 231.84038755736856], [9193.0, 396.02680652680664], [9449.0, 1062.05172413793], [9577.0, 434.6], [9705.0, 694.704481792718], [9961.0, 1002.6483812949645], [9833.0, 935.6], [1053.0, 188.0], [1085.0, 69.06321839080461], [1149.0, 24.094202898550723], [1133.0, 99.0], [1181.0, 55.81455190771954], [1165.0, 49.73397617697115], [1213.0, 58.040624999999956], [1197.0, 57.19816723940439], [1277.0, 59.30113636363636], [1261.0, 25.994666666666646], [1309.0, 60.979318734793196], [1341.0, 54.2844827586207], [1325.0, 52.981707317073145], [1373.0, 103.0], [1357.0, 54.971084337349446], [1405.0, 61.27077747989271], [1389.0, 43.0625], [1437.0, 58.0], [1421.0, 77.07823960880194], [1469.0, 44.25288562434414], [1453.0, 31.794520547945208], [1485.0, 9.092592592592592], [1533.0, 59.615384615384585], [1517.0, 72.60660486674381], [1549.0, 113.48112189859756], [1565.0, 71.51129177958447], [1597.0, 88.10046948356812], [1581.0, 2.941463414634147], [1613.0, 68.06721536351161], [1629.0, 66.34328358208953], [1661.0, 50.059793814433014], [1645.0, 77.99074930619811], [1693.0, 224.00000000000003], [1677.0, 55.87640449438203], [1725.0, 175.72661870503597], [1709.0, 45.9268292682927], [1741.0, 316.6666666666667], [1789.0, 118.12060301507532], [1757.0, 143.63698630136992], [1773.0, 191.71354166666666], [1805.0, 93.10084033613443], [1821.0, 95.38633540372669], [1853.0, 287.66666666666663], [1837.0, 72.17094408799274], [1869.0, 69.29531914893617], [1885.0, 121.29419889502744], [1917.0, 90.0], [1901.0, 64.9865711727842], [1933.0, 109.36527514231501], [1949.0, 140.40225563909777], [1981.0, 87.47058823529412], [1965.0, 189.16666666666663], [1997.0, 122.2335025380712], [2013.0, 103.55999999999999], [2029.0, 32.714285714285715], [2045.0, 845.5], [2106.0, 42.86797752808986], [2138.0, 100.01955307262592], [2170.0, 841.0], [2074.0, 845.0], [2202.0, 144.93431553100044], [2298.0, 64.60776160776159], [2234.0, 137.23551829268322], [2266.0, 57.30714285714285], [2362.0, 114.75952693823923], [2394.0, 396.33333333333337], [2426.0, 107.49783549783547], [2330.0, 836.0], [2458.0, 107.37668161434985], [2490.0, 210.1454545454545], [2522.0, 649.75], [2554.0, 831.0], [2586.0, 149.99835255354213], [2618.0, 197.22168674698793], [2650.0, 531.5], [2682.0, 823.6666666666666], [2746.0, 99.96009975062343], [2778.0, 171.50416501388273], [2810.0, 748.0], [2842.0, 111.0], [2906.0, 110.1709039548023], [2938.0, 157.61869240895115], [2970.0, 190.5215633423181], [3066.0, 338.0271381578944], [3034.0, 270.1102040816326], [3002.0, 848.5], [3130.0, 157.52775330396503], [3162.0, 184.77325853202453], [3194.0, 259.547619047619], [3322.0, 361.3664122137405], [3418.0, 111.0], [3450.0, 114.43868281604867], [3482.0, 241.0077922077922], [3578.0, 266.1919385796545], [3610.0, 213.8749999999998], [3642.0, 292.2400261608895], [3770.0, 201.6191446028513], [3898.0, 190.50544188071382], [3930.0, 296.9829059829059], [3962.0, 238.8933333333333], [4058.0, 176.00667451904263], [4090.0, 224.17335945151802], [4148.0, 104.19534883720927], [4468.0, 216.654153354633], [4596.0, 330.41666666666674], [4660.0, 169.54615384615397], [4724.0, 221.0], [4788.0, 119.27672955974842], [4916.0, 518.0], [4980.0, 292.02425467407704], [5044.0, 156.18985776128642], [5108.0, 506.89653243847914], [5236.0, 476.31325301204816], [5300.0, 266.4484304932735], [5364.0, 1245.0], [5172.0, 1248.0], [5428.0, 515.0], [5492.0, 559.0], [5556.0, 747.0], [5620.0, 352.1426914153136], [5684.0, 432.87820512820457], [5748.0, 880.5500000000003], [5876.0, 298.8923076923074], [5940.0, 396.78146853146825], [6004.0, 695.7239819004525], [6068.0, 737.6666666666666], [6132.0, 576.056710775047], [6196.0, 244.78612244897963], [6324.0, 167.65882352941176], [6388.0, 347.70860927152256], [6260.0, 1227.0], [6516.0, 450.3566666666661], [6644.0, 1890.0], [6708.0, 250.5], [6772.0, 650.6215022091307], [6836.0, 321.8787878787879], [6900.0, 766.9492099322803], [7028.0, 92.0], [7092.0, 648.7216556688654], [7156.0, 740.2392156862746], [6964.0, 1059.0], [7412.0, 304.43725943033087], [7476.0, 536.0714285714287], [7668.0, 488.9333333333333], [7732.0, 829.676616915423], [7796.0, 161.75174337517493], [7924.0, 231.83161512027496], [7988.0, 842.0], [8052.0, 99.21138845553803], [8296.0, 458.5269499048822], [8424.0, 1323.1098901098903], [8552.0, 1751.4248120300745], [8936.0, 328.2857142857142], [9064.0, 1058.6666666666667], [9576.0, 453.29346733668353], [9704.0, 1097.0451127819563], [9448.0, 431.25], [9832.0, 502.170191339376], [9960.0, 902.7965056526212], [8427.0, 595.6455469216984], [8555.0, 2330.6666666666665], [8683.0, 614.8102222222228], [8811.0, 125.26834862385317], [9067.0, 1240.0], [9195.0, 601.5], [9323.0, 934.23487544484], [9579.0, 517.0], [9707.0, 282.0], [9963.0, 713.5], [4213.0, 108.69918330308516], [4341.0, 304.51988899167475], [4469.0, 222.98672566371673], [4597.0, 1261.5], [4661.0, 285.5160753880268], [4853.0, 361.3657165796867], [5045.0, 105.96813495782565], [5109.0, 375.8221680876984], [5301.0, 259.1850220264318], [5173.0, 1249.0], [5493.0, 321.3695652173917], [5621.0, 103.0], [5685.0, 563.1724137931034], [5749.0, 168.60741612713366], [5813.0, 206.0], [5877.0, 505.0], [5941.0, 659.5], [6005.0, 582.4500674763832], [6069.0, 341.0083586626136], [6133.0, 661.0], [6197.0, 324.64721723518824], [6261.0, 534.0606060606058], [6389.0, 374.04940476190507], [6325.0, 1226.0], [6453.0, 772.0], [6517.0, 581.1882129277571], [6581.0, 500.4367816091956], [6645.0, 1219.5], [6837.0, 248.93698094772807], [6901.0, 191.25481927710854], [6773.0, 1217.0], [6709.0, 1219.0], [6965.0, 624.2837116154869], [7157.0, 360.7450787401578], [7093.0, 1055.0], [7029.0, 1056.111111111111], [7413.0, 514.0], [7221.0, 1050.5], [7477.0, 397.30712074303307], [7541.0, 545.9892026578069], [7797.0, 160.72857142857148], [7861.0, 613.0652797704444], [7925.0, 254.94508511806697], [7989.0, 845.2318037974683], [8053.0, 789.3333333333334], [8117.0, 529.6499759268171], [8181.0, 812.3201219512187], [8426.0, 1333.4048000000005], [8682.0, 541.1087613293049], [8554.0, 1024.0], [8298.0, 2393.0], [8810.0, 112.60134378499467], [8938.0, 442.1380090497738], [9066.0, 153.25000000000026], [9194.0, 491.00266666666704], [9322.0, 838.8266411727205], [9450.0, 976.4908350305501], [9834.0, 765.0], [9962.0, 706.0], [8301.0, 166.35115864527629], [8429.0, 238.0], [8557.0, 1962.6577946768057], [8685.0, 1023.5], [8941.0, 620.9557522123893], [9069.0, 406.0], [9197.0, 935.8400940623163], [9453.0, 1042.9705882352969], [9581.0, 957.1558872305136], [9709.0, 271.0241610738251], [9837.0, 835.1584699453553], [9965.0, 1222.386815920398], [2107.0, 9.34662576687117], [2139.0, 134.95212765957456], [2075.0, 844.0], [2203.0, 127.35569620253165], [2299.0, 123.97546012269943], [2235.0, 35.97058823529411], [2267.0, 83.64383561643837], [2331.0, 67.00444444444443], [2363.0, 156.15703703703718], [2395.0, 834.0], [2555.0, 484.4], [2491.0, 110.08218606591569], [2523.0, 180.3866877971475], [2459.0, 831.25], [2619.0, 106.5701133144476], [2651.0, 162.75746540422432], [2683.0, 823.0], [2779.0, 116.74305555555554], [2811.0, 174.76424744276653], [2715.0, 822.3333333333334], [2843.0, 276.5909090909091], [2939.0, 149.66903914590736], [2875.0, 676.25], [2907.0, 850.0], [2971.0, 164.2118758434548], [3003.0, 188.63601823708214], [3035.0, 66.27201966407232], [3067.0, 85.57672349888793], [3131.0, 87.58759124087594], [3163.0, 134.57499999999985], [3195.0, 194.15974282888234], [3227.0, 217.74571428571426], [3323.0, 241.65729166666625], [3355.0, 188.81738544474408], [3483.0, 179.65715622076755], [3515.0, 355.96804932735347], [3579.0, 1068.0], [3643.0, 307.6953781512604], [3675.0, 125.43826405867966], [3707.0, 318.14714714714717], [3771.0, 150.12413793103437], [3803.0, 203.5358342665174], [3899.0, 308.93197278911566], [3931.0, 110.41921397379912], [3963.0, 313.46977886977885], [4091.0, 260.24520255863547], [4214.0, 125.5376344086021], [4342.0, 382.24917218543095], [4406.0, 369.5789473684209], [4470.0, 514.0], [4534.0, 172.9953051643193], [4726.0, 393.7952127659576], [4790.0, 1257.0], [4918.0, 376.04936014625224], [4982.0, 314.5], [5046.0, 630.0], [5110.0, 1250.0], [5174.0, 190.05882352941188], [5302.0, 358.2925373134321], [5366.0, 466.5976277372265], [5558.0, 555.6763341067291], [5494.0, 1243.0], [5750.0, 267.85321100917446], [5814.0, 325.5877551020409], [5878.0, 1237.0], [6006.0, 164.0], [6070.0, 350.4136807817592], [6198.0, 547.5], [6262.0, 652.5510662177319], [6390.0, 299.0], [6454.0, 298.74054621848705], [6582.0, 705.5738307934834], [6646.0, 255.98530440867762], [6710.0, 231.54959785522774], [6838.0, 289.95223880597], [6966.0, 689.9010695187154], [7030.0, 175.41181818181812], [7158.0, 141.08411214953273], [7222.0, 548.3849000740186], [7414.0, 1045.3333333333333], [7350.0, 1047.25], [7478.0, 261.0], [7542.0, 719.2754435107379], [7670.0, 1472.0], [7606.0, 2413.0], [7862.0, 435.7819548872182], [7798.0, 1039.0], [7990.0, 490.69467213114757], [8054.0, 443.2024729520862], [8118.0, 180.1980906921244], [8182.0, 192.4548192771085], [8300.0, 810.814110429448], [8428.0, 195.6], [8684.0, 1026.6666666666667], [9068.0, 323.05248618784503], [9324.0, 980.0], [9580.0, 834.2342978122804], [9708.0, 263.02521008403363], [9452.0, 431.8333333333333], [9836.0, 571.5090909090912], [9964.0, 353.0], [8303.0, 917.0], [8687.0, 503.82336343115026], [8431.0, 1028.0], [8815.0, 275.776605944391], [8943.0, 804.0522088353415], [9071.0, 392.6642685851316], [9327.0, 1043.6168498168495], [9455.0, 158.90983606557373], [9839.0, 2318.5], [4151.0, 232.19327731092446], [4215.0, 186.0], [4279.0, 258.9049111807729], [4407.0, 274.1423948220067], [4535.0, 117.39377845220041], [4599.0, 402.6479289940828], [4727.0, 407.4096774193552], [4791.0, 305.13043478260875], [4919.0, 190.98791755508168], [5111.0, 540.0], [5175.0, 309.9456066945603], [5239.0, 561.9779116465864], [5303.0, 526.0], [5367.0, 267.80931263858076], [5559.0, 173.65157750342922], [5623.0, 260.47142857142865], [5815.0, 382.6301369863016], [6135.0, 131.26568265682667], [6071.0, 1232.0], [5943.0, 1236.0], [6263.0, 169.05284552845526], [6327.0, 752.5], [6199.0, 1228.0], [6455.0, 140.64099037138948], [6519.0, 681.0], [6583.0, 730.8333333333333], [6647.0, 248.72217111315558], [6711.0, 226.484760522496], [6775.0, 800.0], [6903.0, 1025.0], [7031.0, 236.1789156626508], [7095.0, 1157.3636363636363], [7159.0, 1053.0], [6967.0, 1059.0], [7223.0, 693.5601415094341], [7287.0, 182.11349036402552], [7351.0, 550.3455882352941], [7415.0, 1045.0], [7479.0, 261.0], [7543.0, 1607.5], [7607.0, 277.9291217257323], [7671.0, 441.42283026934547], [7735.0, 1037.311627906977], [7863.0, 483.6666666666667], [7991.0, 526.6666666666666], [8055.0, 194.42063067878166], [8558.0, 1986.4328537170284], [8686.0, 1022.0], [8814.0, 343.38386648122395], [8942.0, 730.0945454545464], [9198.0, 1017.9369918699197], [9326.0, 1005.1612903225804], [9454.0, 639.2911990549316], [9582.0, 1044.0], [9710.0, 526.0], [9838.0, 1060.0], [9966.0, 470.8129032258064], [8305.0, 251.5638859556493], [8433.0, 405.9674952198853], [8561.0, 1024.0], [9201.0, 772.757201646091], [8945.0, 1013.0], [9585.0, 657.1247872943852], [9713.0, 548.5047199496541], [9457.0, 432.7208333333332], [9841.0, 1079.323619631904], [9969.0, 281.0], [519.0, 27.625695732838604], [527.0, 7.727272727272726], [543.0, 10.273936170212764], [535.0, 18.477198697068417], [559.0, 26.591869918699217], [551.0, 10.680057388809189], [567.0, 0.9052631578947365], [583.0, 12.75859788359788], [591.0, 12.723195515066553], [607.0, 19.13092550790068], [599.0, 38.49999999999999], [623.0, 40.166666666666664], [639.0, 0.8888888888888888], [631.0, 12.94601889338732], [615.0, 893.0], [655.0, 35.02491103202847], [647.0, 60.19557195571954], [671.0, 14.075388026607536], [663.0, 26.660714285714285], [687.0, 94.0], [679.0, 69.0], [695.0, 24.238938053097346], [703.0, 14.463768115942042], [719.0, 75.0], [711.0, 114.18131868131863], [735.0, 51.907949790794966], [727.0, 66.4], [751.0, 54.734326018808765], [743.0, 9.023872679045075], [759.0, 78.0], [775.0, 1.0833333333333335], [783.0, 92.58864696734062], [799.0, 51.92550143266469], [791.0, 58.99456521739133], [815.0, 0.9047619047619045], [831.0, 17.376283846872084], [823.0, 42.33065326633168], [839.0, 51.61174242424244], [847.0, 51.088838268792706], [863.0, 15.615384615384617], [855.0, 20.106546854942227], [871.0, 27.635186595582613], [879.0, 122.85714285714283], [895.0, 17.865353037766845], [887.0, 0.8554216867469879], [903.0, 37.197537772803585], [911.0, 49.68763250883388], [927.0, 685.5], [919.0, 54.276190476190436], [943.0, 23.38725490196077], [935.0, 1.3333333333333333], [959.0, 0.8705035971223023], [951.0, 27.615879828326186], [967.0, 25.141176470588235], [975.0, 28.548736462093842], [991.0, 31.063938618925896], [983.0, 74.0], [999.0, 82.0], [1007.0, 21.345195729537373], [1023.0, 23.388888888888886], [1015.0, 22.062615101289136], [1038.0, 184.09722222222223], [1054.0, 38.75764272559838], [1086.0, 57.1331811263318], [1070.0, 98.87113402061848], [1118.0, 59.28423475258923], [1134.0, 3.3589743589743586], [1102.0, 876.0], [1166.0, 77.33333333333333], [1182.0, 23.15302491103204], [1214.0, 59.96171376481308], [1198.0, 66.73410404624275], [1230.0, 70.38848396501452], [1278.0, 62.02543290043279], [1262.0, 352.3333333333333], [1294.0, 61.041770263550596], [1310.0, 29.492187499999996], [1342.0, 31.0], [1326.0, 63.438131921039925], [1358.0, 31.137931034482786], [1374.0, 4.281250000000001], [1406.0, 349.3333333333333], [1390.0, 475.0], [1438.0, 74.3291753291754], [1422.0, 35.54471544715446], [1470.0, 30.000000000000004], [1486.0, 106.66666666666667], [1502.0, 61.098201936376206], [1534.0, 71.58489304812848], [1518.0, 89.46478873239438], [1550.0, 68.63184079601989], [1566.0, 73.0217391304348], [1598.0, 26.682539682539684], [1582.0, 1.1333333333333335], [1614.0, 80.23232740801964], [1630.0, 80.82168330955777], [1662.0, 95.21796482412064], [1646.0, 141.93877551020412], [1678.0, 69.73689320388334], [1710.0, 83.99945235487398], [1726.0, 856.0], [1694.0, 857.0], [1742.0, 59.30188679245281], [1774.0, 59.0], [1806.0, 105.09000762776505], [1854.0, 89.20052083333341], [1822.0, 114.2876712328767], [1838.0, 113.67680278019131], [1870.0, 107.86671001300402], [1886.0, 69.66986706056123], [1918.0, 89.89200415368639], [1902.0, 81.41438032166522], [1934.0, 427.5], [1982.0, 96.0184049079755], [1950.0, 99.9135021097046], [1966.0, 134.13656387665193], [2014.0, 116.19504643962847], [2030.0, 290.0], [2076.0, 135.42250196695517], [2108.0, 33.800000000000004], [2140.0, 425.5], [2204.0, 99.47619047619045], [2300.0, 130.18584825234433], [2236.0, 98.0], [2268.0, 141.92207792207773], [2332.0, 96.73746312684365], [2364.0, 119.83851851851853], [2460.0, 527.0], [2556.0, 197.59927797833942], [2492.0, 648.5], [2524.0, 127.64620253164546], [2652.0, 125.68518518518516], [2684.0, 148.39064783244027], [2716.0, 171.92328278322927], [2812.0, 98.80468749999993], [2844.0, 141.47324940991314], [2876.0, 197.5614250614251], [2972.0, 105.87867298578186], [3004.0, 97.30925324675327], [3036.0, 198.0], [3100.0, 210.7617328519855], [3196.0, 117.16129032258067], [3228.0, 189.8840579710147], [3260.0, 234.86915887850463], [3324.0, 149.41025641025638], [3356.0, 169.6617100371748], [3388.0, 267.964705882353], [3516.0, 121.45930232558133], [3548.0, 251.8599545798639], [3644.0, 240.0], [3676.0, 93.62487945998073], [3708.0, 263.01129943502866], [3804.0, 226.24035608308614], [3836.0, 252.42834890965713], [3964.0, 328.9404761904764], [3996.0, 232.59637714816523], [4152.0, 287.1479212253841], [4216.0, 165.5], [4280.0, 385.3071017274473], [4472.0, 441.8553417385534], [4600.0, 126.92537313432857], [4792.0, 234.01593625498023], [4984.0, 338.15014326647554], [5048.0, 224.9985380116959], [5112.0, 1249.5], [5240.0, 251.57481060606054], [5432.0, 450.0931677018636], [5624.0, 189.88455476753342], [5752.0, 384.0], [5816.0, 540.0], [5880.0, 580.3523292627776], [5688.0, 1239.5], [6008.0, 277.0], [6136.0, 99.94693504117119], [5944.0, 1235.0], [6264.0, 253.0], [6328.0, 358.4393063583822], [6520.0, 701.0140845070422], [6648.0, 978.6666666666666], [6776.0, 414.16736842105405], [6840.0, 98.0], [6904.0, 1544.0], [7032.0, 895.3333333333334], [7096.0, 1135.0], [7160.0, 1052.0], [7288.0, 205.90513219284594], [7352.0, 260.10381077529536], [7416.0, 608.7706855791952], [7480.0, 236.90597014925376], [7608.0, 351.79520295202934], [7672.0, 706.808080808081], [7544.0, 1044.0], [7736.0, 798.5744680851069], [7800.0, 520.3084648493544], [7928.0, 519.5535714285713], [7992.0, 790.6666666666666], [8304.0, 266.04044943820213], [8432.0, 346.5092207019629], [8688.0, 102.61060802069865], [8816.0, 494.5], [8944.0, 963.2857142857143], [9072.0, 193.18534961154293], [9200.0, 601.0], [9328.0, 310.71987951807216], [9584.0, 1067.2916666666677], [9712.0, 601.9090909090909], [9840.0, 1122.0937499999973], [9968.0, 281.0], [8435.0, 846.0], [8563.0, 2280.8771653543304], [8691.0, 276.8565644881438], [8819.0, 402.35952177625956], [8947.0, 987.8901345291483], [9075.0, 250.75242195909559], [9203.0, 600.0], [9331.0, 345.151567944251], [9459.0, 397.5000000000002], [9715.0, 458.22222222222223], [9971.0, 217.1692307692309], [4217.0, 274.1093023255813], [4345.0, 214.30902111324374], [4409.0, 432.0], [4473.0, 139.2716279069767], [4537.0, 108.0], [4665.0, 287.9124537607891], [4793.0, 231.46658415841588], [4857.0, 281.0], [4729.0, 1258.1666666666667], [4985.0, 128.38084632516708], [5049.0, 109.46177526936901], [5113.0, 268.97559115179257], [4921.0, 1253.5], [5241.0, 150.05701754385962], [5369.0, 1245.0], [5433.0, 153.64263322884008], [5497.0, 331.0157099697879], [5561.0, 875.0], [5625.0, 314.5], [5689.0, 407.7089310504397], [5753.0, 374.9334975369459], [5881.0, 166.0], [5945.0, 434.11845386533645], [6009.0, 225.36906211936653], [6201.0, 583.8148854961829], [6329.0, 454.0126582278483], [6393.0, 692.1537693459809], [6521.0, 215.62583290620236], [6713.0, 561.6666666666666], [6777.0, 119.2745098039216], [6841.0, 502.69213313161896], [6905.0, 303.0490693739423], [6969.0, 817.0], [7033.0, 822.1111111111111], [7097.0, 1321.3646649260245], [7161.0, 217.27915726109853], [7417.0, 722.1735537190084], [7353.0, 1047.5], [7481.0, 300.21898171033183], [7673.0, 1953.0], [7545.0, 1044.5], [7737.0, 167.09819639278552], [7801.0, 612.8560885608849], [7865.0, 203.5691399662736], [7929.0, 420.27783842794753], [7993.0, 279.5594405594405], [8057.0, 910.238095238095], [8121.0, 333.0047694753578], [8185.0, 302.0738916256158], [8306.0, 421.7931034482759], [8562.0, 2270.0941475826985], [8434.0, 1028.0], [8818.0, 356.0600162205997], [8946.0, 964.9656750572083], [9074.0, 418.6154313487242], [9202.0, 265.9072620215901], [9458.0, 190.3609831029185], [9586.0, 168.9953703703703], [9714.0, 504.41996830427917], [9970.0, 189.303563761271], [9842.0, 1365.0], [8309.0, 379.98875739644933], [8437.0, 613.5144968732234], [8693.0, 837.3333333333334], [8949.0, 1016.5], [9077.0, 224.78332092330643], [9205.0, 233.0845771144278], [9333.0, 526.0], [9589.0, 224.10846245530385], [9717.0, 810.8133971291867], [9845.0, 367.1853729181752], [9973.0, 228.0], [2173.0, 128.33274021352307], [2109.0, 76.24977127172905], [2141.0, 86.25138558986525], [2205.0, 117.0], [2237.0, 121.35880398671097], [2269.0, 152.3038605230386], [2333.0, 124.51610095735431], [2365.0, 117.53448275862068], [2429.0, 163.26580645161306], [2397.0, 252.0825688073396], [2557.0, 126.9495689655175], [2525.0, 122.47872340425536], [2493.0, 830.25], [2461.0, 835.0], [2589.0, 209.2144329896909], [2685.0, 140.22912621359222], [2653.0, 825.0], [2717.0, 131.99380165289267], [2749.0, 185.6131687242799], [2813.0, 822.0], [2877.0, 126.1684446939922], [2909.0, 161.0564971751411], [2973.0, 3298.0], [3101.0, 172.43897026187324], [3133.0, 114.0], [3165.0, 24.0], [3229.0, 143.5847750865052], [3261.0, 187.25442764578858], [3293.0, 198.85301062573825], [3389.0, 184.74938875305625], [3421.0, 184.1456228956228], [3517.0, 163.0], [3549.0, 257.49430324277], [3581.0, 221.5268817204301], [3741.0, 216.91545643153503], [3773.0, 331.2], [3837.0, 163.6647519582246], [3869.0, 134.8913917940468], [3901.0, 378.0], [3933.0, 236.0], [3997.0, 373.75528700906347], [4093.0, 503.0], [4029.0, 236.03244166192397], [4061.0, 193.08695652173913], [4154.0, 510.0], [4218.0, 286.77246011754767], [4346.0, 132.22794492605823], [4474.0, 715.0], [4538.0, 209.6778846153845], [4602.0, 107.0], [4666.0, 234.77830188679224], [4858.0, 244.0013404825739], [4794.0, 1255.0], [4922.0, 266.40987654320975], [5114.0, 123.77769289534004], [4986.0, 1252.0], [5178.0, 391.00111607142884], [5306.0, 327.21654929577466], [5370.0, 161.39393939393958], [5498.0, 344.79712041884807], [5626.0, 1241.0], [5434.0, 1243.0], [5690.0, 156.75956284153008], [5754.0, 279.5610711952976], [5818.0, 136.0], [5882.0, 1236.5], [5946.0, 1037.8], [6010.0, 245.32932166301944], [6074.0, 176.10214250124562], [6138.0, 210.0], [6202.0, 464.71556550951817], [6330.0, 91.33333333333333], [6394.0, 694.8176470588239], [6266.0, 1226.0], [6458.0, 263.0], [6522.0, 128.12207357859532], [6586.0, 855.6209677419354], [6650.0, 386.1269349845204], [6842.0, 663.0763131813674], [6906.0, 286.43710870802545], [6970.0, 837.2090909090908], [7034.0, 337.3789173789173], [7098.0, 1230.779850746269], [7162.0, 304.6501766784446], [7418.0, 987.0], [7354.0, 1048.0], [7226.0, 1050.0], [7482.0, 416.97560975609775], [7546.0, 828.2325581395353], [7610.0, 534.0], [7802.0, 702.0], [7866.0, 195.58158429248476], [7930.0, 608.527906976744], [7994.0, 269.69059405940607], [8058.0, 226.02221324717289], [8122.0, 576.8452138492875], [8186.0, 301.40652029274787], [8436.0, 673.9183673469386], [8692.0, 355.7933227344994], [8564.0, 2386.3333333333335], [8308.0, 1940.0], [8948.0, 977.6692307692309], [9076.0, 852.5], [8820.0, 1017.0], [9332.0, 346.2958236658928], [9460.0, 517.0], [9716.0, 428.5], [9588.0, 425.2], [9972.0, 315.0], [8567.0, 1525.3499458288195], [8695.0, 446.8598214285716], [8439.0, 1028.25], [8823.0, 657.5563665855636], [8951.0, 350.2897727272725], [9079.0, 251.5], [9207.0, 304.4210526315791], [9463.0, 503.0518331226298], [9591.0, 498.0], [9719.0, 1002.8219178082189], [9975.0, 362.81628392484305], [9847.0, 1682.3333333333333], [4283.0, 467.98044692737403], [4347.0, 294.4019607843137], [4411.0, 301.0452793834297], [4539.0, 333.61854728186387], [4603.0, 1261.0], [4731.0, 143.22428748451077], [4795.0, 346.3333333333333], [4859.0, 459.7227101631115], [4923.0, 164.56222802436895], [5051.0, 202.62763037511422], [5179.0, 404.4594594594594], [5307.0, 156.7031250000001], [5371.0, 149.46896551724143], [5243.0, 1247.0], [5499.0, 519.0], [5563.0, 212.47298297557364], [5627.0, 292.25], [5819.0, 480.44206008583734], [5883.0, 1236.5], [5691.0, 1240.0], [6011.0, 238.32653061224485], [6075.0, 90.11842105263155], [6139.0, 324.18256880733924], [6267.0, 289.8452797202799], [6395.0, 782.0], [6459.0, 217.55094339622633], [6587.0, 150.56970509383416], [6651.0, 482.45591787439605], [6523.0, 1222.0], [6715.0, 589.643659711076], [6843.0, 792.0], [6907.0, 672.0], [6971.0, 362.7108092812678], [7035.0, 221.7241206030152], [7227.0, 399.97906602254454], [7291.0, 551.7367624810898], [7355.0, 197.3457943925235], [7419.0, 1047.0], [7547.0, 342.8330071754722], [7611.0, 583.8739946380705], [7675.0, 811.6728395061731], [7483.0, 1044.6666666666667], [7931.0, 748.5], [7995.0, 305.436224489796], [8123.0, 1033.5], [8310.0, 293.3799126637555], [8438.0, 711.638766519824], [8566.0, 1025.0], [8822.0, 567.4575273338928], [9078.0, 16.726551226551248], [9206.0, 206.5288888888894], [9462.0, 1074.0], [9590.0, 233.19281663516074], [9718.0, 853.8867816091947], [9846.0, 132.52695092518073], [9974.0, 373.5488683127572], [8313.0, 688.7402439024398], [8569.0, 318.6666666666667], [8441.0, 1028.0], [8953.0, 157.0], [9081.0, 74.26380042462854], [9209.0, 488.030303030303], [8825.0, 1017.0], [9337.0, 710.0544692737432], [9593.0, 481.1570680628271], [9721.0, 417.6666666666667], [9465.0, 432.0], [9849.0, 401.68899521531097], [1055.0, 478.5], [1039.0, 54.09073935772973], [1087.0, 34.30199203187247], [1071.0, 34.30976706170828], [1103.0, 66.93269230769234], [1119.0, 43.908309455587435], [1151.0, 57.15825688073396], [1135.0, 58.80329670329669], [1167.0, 47.32161687170468], [1183.0, 555.6], [1215.0, 49.14481707317069], [1247.0, 69.78821444395221], [1231.0, 47.9409190371991], [1279.0, 8.054054054054053], [1263.0, 65.24999999999989], [1295.0, 48.214188267394285], [1327.0, 27.683870967741935], [1359.0, 90.93103448275862], [1375.0, 52.166797797010176], [1407.0, 472.5], [1391.0, 64.83582089552239], [1439.0, 74.50819672131146], [1471.0, 29.000000000000004], [1455.0, 12.136363636363635], [1487.0, 63.663421418637], [1503.0, 70.94880546075089], [1535.0, 71.25055928411633], [1519.0, 125.73397435897438], [1551.0, 45.88888888888888], [1567.0, 103.05286343612335], [1599.0, 68.96551724137932], [1583.0, 81.37898267188358], [1631.0, 217.0], [1615.0, 24.392307692307693], [1663.0, 84.0], [1647.0, 858.0], [1679.0, 89.41795665634677], [1695.0, 69.3671912255604], [1727.0, 50.68999999999998], [1711.0, 134.21428571428572], [1759.0, 221.5], [1743.0, 62.71749755620732], [1791.0, 12.625], [1775.0, 854.0], [1807.0, 3.0], [1855.0, 87.88070829450136], [1823.0, 125.28571428571429], [1839.0, 81.76666666666667], [1871.0, 120.24786324786334], [1919.0, 85.57686212361322], [1887.0, 82.02258064516134], [1903.0, 193.3136531365314], [1935.0, 28.218274111675132], [1983.0, 106.221052631579], [1967.0, 9.333333333333334], [1999.0, 59.72689075630252], [2015.0, 8.0], [2031.0, 288.7869822485206], [2110.0, 165.90506780870803], [2174.0, 126.05175781249987], [2142.0, 135.73993808049522], [2238.0, 89.63458588957067], [2302.0, 70.11508379888261], [2270.0, 101.0], [2334.0, 96.0], [2366.0, 128.648879402348], [2430.0, 100.52266521026763], [2398.0, 130.67871815940862], [2462.0, 177.80474198047418], [2494.0, 247.0], [2590.0, 123.31055480378895], [2622.0, 169.9822222222222], [2686.0, 823.0], [2750.0, 125.87206661619965], [2782.0, 151.02235294117648], [2814.0, 827.0], [2910.0, 119.93472803347274], [2942.0, 234.6397966594045], [2878.0, 824.6666666666666], [3038.0, 70.45014480761267], [3070.0, 33.571789686552144], [2974.0, 1156.0], [3134.0, 261.62851600387944], [3294.0, 129.773170731707], [3422.0, 190.14950419527065], [3454.0, 331.315014720314], [3582.0, 169.47683615819236], [3518.0, 202.5], [3550.0, 1073.0], [3614.0, 206.426324503311], [3710.0, 111.0], [3742.0, 116.09074410163342], [3774.0, 181.25891677675043], [3870.0, 148.4946004319653], [3902.0, 220.86048988285413], [3998.0, 431.0], [4030.0, 179.5258855585831], [4062.0, 193.1601503759399], [4094.0, 509.2305555555553], [4156.0, 199.45807770961144], [4220.0, 67.5], [4284.0, 166.28893442622964], [4412.0, 151.80665813060196], [4604.0, 241.72921760391228], [4732.0, 106.49721913236918], [4796.0, 499.07664233576617], [4924.0, 286.90440386681007], [5052.0, 112.07257546563919], [4988.0, 1253.0], [5180.0, 463.0519480519482], [5372.0, 219.30273224043722], [5244.0, 1247.0], [5436.0, 197.9328519855598], [5564.0, 202.1138370951915], [5628.0, 515.4185755935031], [5500.0, 1242.0], [5692.0, 998.0], [5756.0, 473.0], [5820.0, 297.2784722222224], [5884.0, 238.01363636363627], [6140.0, 371.45018450184455], [5948.0, 1234.0], [6332.0, 555.8216939078751], [6396.0, 1225.0], [6460.0, 318.17922705314083], [6588.0, 122.57986111111106], [6716.0, 676.2877094972068], [6780.0, 254.0], [6908.0, 765.0], [6972.0, 132.1830985915493], [7036.0, 342.0], [7228.0, 148.38978102189776], [7292.0, 614.0841983852366], [7356.0, 258.24139378673345], [7420.0, 1046.0], [7548.0, 216.0], [7612.0, 698.8100056211362], [7676.0, 263.29130850047727], [7740.0, 203.37174721189587], [7868.0, 1038.5], [8060.0, 1047.5], [7996.0, 1035.0], [8568.0, 198.25801640566738], [8696.0, 778.0796064400723], [8312.0, 1031.0], [8952.0, 108.05742725880555], [9080.0, 83.87561576354679], [9336.0, 571.1266808209485], [9464.0, 708.5422427035329], [9720.0, 416.3333333333333], [9848.0, 2317.0], [8315.0, 897.0], [8443.0, 1121.6649350649361], [8699.0, 1146.4349999999995], [8827.0, 569.4481994459841], [8955.0, 211.42248062015517], [9083.0, 255.41365461847383], [9211.0, 347.9252873563215], [9467.0, 815.1594427244581], [9723.0, 611.4709351305808], [9851.0, 23.0], [9979.0, 820.4126865671633], [4157.0, 103.67824497257762], [4285.0, 199.45070422535204], [4477.0, 417.3301707779887], [4605.0, 351.0000000000001], [4669.0, 186.7874015748031], [4797.0, 148.13987473903978], [4733.0, 1258.0], [4989.0, 418.78800000000007], [5117.0, 251.62335216572498], [4925.0, 1253.5], [5245.0, 212.63763509218074], [5309.0, 246.0], [5373.0, 332.8], [5181.0, 1248.0], [5437.0, 213.06325301204808], [5565.0, 180.20833333333331], [5501.0, 1242.0], [5693.0, 263.265895953757], [5885.0, 233.84132841328378], [5821.0, 1238.0], [5949.0, 221.60986775177977], [6013.0, 1232.5], [6333.0, 569.6421940928273], [6397.0, 1225.0], [6205.0, 1228.0], [6461.0, 540.0], [6525.0, 299.1296296296297], [6781.0, 266.3659981768458], [6845.0, 842.3846153846155], [6909.0, 691.103139013453], [6973.0, 105.0], [7101.0, 309.0], [7165.0, 528.6948051948049], [7037.0, 1055.8], [7421.0, 851.696645253391], [7485.0, 448.33108108108155], [7613.0, 782.6129032258065], [7677.0, 1041.0], [7549.0, 1043.25], [7741.0, 260.8625636279505], [7805.0, 825.2838801711841], [7869.0, 407.48803191489367], [7933.0, 832.3750000000009], [8061.0, 527.1032090199488], [8125.0, 378.8260869565218], [8189.0, 780.0], [7997.0, 1036.0], [8314.0, 699.9578783151329], [8442.0, 1094.8567901234553], [8826.0, 1019.0928725701935], [9210.0, 358.0300242130758], [9594.0, 483.091842247434], [9722.0, 1111.8983451536653], [9466.0, 436.0], [9850.0, 331.6179669030734], [9978.0, 788.7923076923083], [8317.0, 650.8538704581355], [8573.0, 613.1043543543558], [8701.0, 973.5485232067509], [8445.0, 1027.3333333333333], [8829.0, 226.0], [8957.0, 505.09090909090907], [9085.0, 193.0635294117646], [9213.0, 758.2032967032965], [9341.0, 944.0998851894377], [9597.0, 776.0], [9725.0, 415.0], [2079.0, 137.99250535331902], [2175.0, 175.0], [2111.0, 140.4545454545454], [2143.0, 65.66666666666667], [2207.0, 123.55268817204319], [2303.0, 114.41623309053087], [2239.0, 93.63653136531373], [2271.0, 114.06042128603126], [2335.0, 51.5], [2399.0, 131.52722443559085], [2431.0, 833.3333333333333], [2367.0, 834.0], [2463.0, 116.14514348785868], [2495.0, 127.67148182665423], [2527.0, 150.0], [2591.0, 99.6350931677018], [2687.0, 624.25], [2623.0, 128.08682855040453], [2655.0, 185.10077519379865], [2751.0, 244.5], [2783.0, 111.88105200239076], [2815.0, 216.3206470028543], [2847.0, 249.0], [2943.0, 135.28164556962034], [2879.0, 817.0], [2975.0, 157.74622573687995], [3039.0, 173.72549019607834], [3071.0, 25.188449848024295], [3135.0, 152.6786197564275], [3167.0, 168.06998011928422], [3199.0, 174.29805615550748], [3231.0, 202.0], [3327.0, 194.0503533568907], [3391.0, 246.0], [3455.0, 244.0517482517479], [3487.0, 120.11522134627045], [3615.0, 174.6199233716477], [3647.0, 199.55538694992404], [3679.0, 321.46257485029946], [3775.0, 112.42605633802809], [3807.0, 149.11436413540724], [3839.0, 253.5], [3903.0, 104.31657142857155], [3935.0, 333.5374692874686], [4063.0, 280.49675850891396], [4095.0, 122.5186015239802], [4222.0, 420.4230769230771], [4350.0, 301.66772554002586], [4478.0, 326.49170616113736], [4606.0, 1260.6666666666665], [4670.0, 219.28473804100258], [4798.0, 1257.3333333333333], [4990.0, 424.0766319772942], [5054.0, 271.1518737672583], [5118.0, 275.53389830508445], [5246.0, 476.4928478543562], [5310.0, 304.5245901639345], [5374.0, 1245.0], [5502.0, 363.9568131049887], [5438.0, 1243.3333333333333], [5694.0, 277.482105263158], [5758.0, 675.2815845824417], [5886.0, 537.0], [5822.0, 1238.0], [5950.0, 331.75682382133994], [6014.0, 431.5447897623401], [6078.0, 384.8179202630493], [6206.0, 184.74661354581684], [6270.0, 566.0], [6334.0, 180.15864022662876], [6398.0, 301.99780058651044], [6526.0, 335.7118301314459], [6654.0, 821.4767441860466], [6782.0, 241.79999999999995], [6846.0, 543.1844713656385], [6910.0, 700.7601499063086], [7038.0, 321.9622356495469], [7102.0, 431.8517382413084], [7166.0, 648.0542105263165], [6974.0, 1057.0], [7422.0, 198.0057208237986], [7358.0, 1048.0], [7294.0, 1049.0], [7486.0, 422.88286334056346], [7550.0, 1164.8], [7678.0, 1726.5], [7742.0, 533.0], [7806.0, 725.4076388888888], [7870.0, 490.3393939393939], [7934.0, 535.9978181818179], [7998.0, 372.0757479312547], [8062.0, 1177.0], [8126.0, 439.55286521388166], [8190.0, 417.6160661547552], [8572.0, 572.8969325153377], [8700.0, 845.4497816593888], [8444.0, 1027.0], [8828.0, 148.76377952755902], [8956.0, 279.62090752441173], [9084.0, 186.33688699360283], [9340.0, 805.91643454039], [9468.0, 995.7714285714286], [9724.0, 415.3333333333333], [9596.0, 427.3333333333333], [9980.0, 213.0], [9852.0, 1334.4], [8447.0, 346.5238406270403], [8831.0, 205.2112537018756], [8959.0, 505.3491525423727], [9087.0, 376.98191933240616], [9215.0, 710.9888268156424], [9343.0, 750.5], [9599.0, 443.58354114713194], [9727.0, 259.1550684931508], [9471.0, 436.0], [9855.0, 680.1700844390821], [9983.0, 877.7391757955148], [4223.0, 117.78404401650614], [4351.0, 266.58497536945805], [4479.0, 285.0], [4543.0, 314.93285939968337], [4735.0, 164.84839650145767], [4863.0, 191.8376984126977], [4671.0, 1259.3333333333333], [4991.0, 444.0], [5055.0, 159.54028877503495], [5119.0, 1250.0], [4927.0, 1254.0], [5183.0, 195.38492871690406], [5311.0, 295.8320707070709], [5375.0, 359.051532033426], [5247.0, 1247.0], [5439.0, 551.0], [5503.0, 155.40260950605796], [5567.0, 519.6915032679742], [5631.0, 951.5], [5759.0, 477.72438443208966], [5823.0, 261.8699386503067], [5887.0, 320.0], [6015.0, 401.73908577298397], [6079.0, 644.0], [6207.0, 205.2884615384615], [6271.0, 587.9741784037562], [6335.0, 104.5], [6399.0, 126.81757877280249], [6527.0, 508.0], [6591.0, 230.81753031973545], [6655.0, 600.7085452695832], [6463.0, 1223.0], [6719.0, 789.7560975609754], [6783.0, 505.0], [6847.0, 148.7136690647482], [6911.0, 702.588679245283], [6975.0, 217.75409836065558], [7039.0, 143.82256355932242], [7103.0, 429.7308003233632], [7167.0, 694.1865671641791], [7359.0, 524.3010033444818], [7487.0, 791.0], [7551.0, 195.74963820549954], [7679.0, 2408.0], [7807.0, 276.0], [7999.0, 529.5839416058396], [8063.0, 1323.6666666666667], [8191.0, 427.1130790190738], [8318.0, 114.52657004830925], [8958.0, 494.5], [9086.0, 1579.0], [9214.0, 874.2312108559507], [9342.0, 1051.0], [9598.0, 476.5232300884959], [9726.0, 388.4], [9470.0, 435.0], [9854.0, 728.3873290136801]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[7264.4992993712585, 431.220670263375]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 10000.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 726545.0, "minX": 1.53080682E12, "maxY": 1.89500282E7, "series": [{"data": [[1.53080724E12, 1.5926689133333333E7], [1.53080694E12, 1.7055533933333334E7], [1.53080742E12, 4287516.6], [1.53080688E12, 1.89500282E7], [1.53080736E12, 1.5637499133333333E7], [1.53080706E12, 1.6294891966666667E7], [1.530807E12, 1.6640577766666668E7], [1.53080718E12, 1.5497561683333334E7], [1.53080712E12, 1.6431186266666668E7], [1.53080682E12, 1.4225646466666667E7], [1.5308073E12, 1.5300604733333332E7]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.53080724E12, 2698874.55], [1.53080694E12, 2890133.5], [1.53080742E12, 726545.0], [1.53080688E12, 3211177.3], [1.53080736E12, 2649869.8833333333], [1.53080706E12, 2761678.65], [1.530807E12, 2819871.4166666665], [1.53080718E12, 2626292.3666666667], [1.53080712E12, 2784355.183333333], [1.53080682E12, 2410600.35], [1.5308073E12, 2592779.35]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53080742E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 35.38127489995112, "minX": 1.53080682E12, "maxY": 621.5305715258693, "series": [{"data": [[1.53080724E12, 602.3702734039957], [1.53080694E12, 250.29685612618528], [1.53080742E12, 619.5593386623744], [1.53080688E12, 123.46456089784579], [1.53080736E12, 612.1936943224565], [1.53080706E12, 493.63092556528875], [1.530807E12, 371.25421865783693], [1.53080718E12, 614.8332087660887], [1.53080712E12, 577.8153301928152], [1.53080682E12, 35.38127489995112], [1.5308073E12, 621.5305715258693]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53080742E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 35.37884328696778, "minX": 1.53080682E12, "maxY": 621.5272131618854, "series": [{"data": [[1.53080724E12, 602.3672171295324], [1.53080694E12, 250.29190204692864], [1.53080742E12, 619.5554923799097], [1.53080688E12, 123.45917890318712], [1.53080736E12, 612.1904266516663], [1.53080706E12, 493.6274685781844], [1.530807E12, 371.24989180473347], [1.53080718E12, 614.8303569133742], [1.53080712E12, 577.8122087261677], [1.53080682E12, 35.37884328696778], [1.5308073E12, 621.5272131618854]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53080742E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 0.0558509357397834, "minX": 1.53080682E12, "maxY": 70.61678762946373, "series": [{"data": [[1.53080724E12, 53.671739115211906], [1.53080694E12, 3.5902528981317894], [1.53080742E12, 70.61678762946373], [1.53080688E12, 1.128098367492418], [1.53080736E12, 62.05068506968987], [1.53080706E12, 27.753416903259993], [1.530807E12, 9.04549084265924], [1.53080718E12, 59.57064503892184], [1.53080712E12, 46.598156017092776], [1.53080682E12, 0.0558509357397834], [1.5308073E12, 63.88997791290044]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53080742E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 0.0, "minX": 1.53080682E12, "maxY": 8542.0, "series": [{"data": [[1.53080724E12, 7589.0], [1.53080694E12, 4997.0], [1.53080742E12, 5976.0], [1.53080688E12, 2634.0], [1.53080736E12, 7534.0], [1.53080706E12, 8542.0], [1.530807E12, 4613.0], [1.53080718E12, 7595.0], [1.53080712E12, 7248.0], [1.53080682E12, 1185.0], [1.5308073E12, 7623.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.53080724E12, 0.0], [1.53080694E12, 0.0], [1.53080742E12, 1.0], [1.53080688E12, 0.0], [1.53080736E12, 0.0], [1.53080706E12, 0.0], [1.530807E12, 1.0], [1.53080718E12, 0.0], [1.53080712E12, 0.0], [1.53080682E12, 0.0], [1.5308073E12, 0.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.53080724E12, 1071.0], [1.53080694E12, 602.0], [1.53080742E12, 1255.0], [1.53080688E12, 412.0], [1.53080736E12, 1107.0], [1.53080706E12, 1051.0], [1.530807E12, 818.0], [1.53080718E12, 1099.0], [1.53080712E12, 1074.0], [1.53080682E12, 140.0], [1.5308073E12, 998.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.53080724E12, 1936.0], [1.53080694E12, 713.9900000000016], [1.53080742E12, 2386.0], [1.53080688E12, 469.0], [1.53080736E12, 2203.0], [1.53080706E12, 2049.0], [1.530807E12, 1524.0], [1.53080718E12, 2085.0], [1.53080712E12, 1921.0], [1.53080682E12, 152.0], [1.5308073E12, 1917.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.53080724E12, 1077.0], [1.53080694E12, 679.0], [1.53080742E12, 1552.0], [1.53080688E12, 419.0], [1.53080736E12, 1211.0], [1.53080706E12, 1067.0], [1.530807E12, 823.0], [1.53080718E12, 1227.0], [1.53080712E12, 1404.9500000000007], [1.53080682E12, 146.0], [1.5308073E12, 1213.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53080742E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 6.5, "minX": 4484.0, "maxY": 833.0, "series": [{"data": [[17406.0, 523.0], [17047.0, 684.0], [17187.0, 692.0], [16659.0, 689.0], [17840.0, 397.0], [4484.0, 833.0], [19822.0, 273.0], [14880.0, 87.0], [16211.0, 561.0], [16004.0, 538.0], [16357.0, 698.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[17406.0, 694.0], [17047.0, 146.0], [19822.0, 6.5], [16211.0, 479.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 19822.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 6.5, "minX": 4484.0, "maxY": 833.0, "series": [{"data": [[17406.0, 523.0], [17047.0, 684.0], [17187.0, 692.0], [16659.0, 689.0], [17840.0, 397.0], [4484.0, 833.0], [19822.0, 273.0], [14880.0, 87.0], [16211.0, 561.0], [16004.0, 538.0], [16357.0, 698.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[17406.0, 694.0], [17047.0, 146.0], [19822.0, 6.5], [16211.0, 479.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 19822.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 4436.083333333333, "minX": 1.53080682E12, "maxY": 19822.416666666668, "series": [{"data": [[1.53080724E12, 16617.6], [1.53080694E12, 17842.833333333332], [1.53080742E12, 4436.083333333333], [1.53080688E12, 19822.416666666668], [1.53080736E12, 16334.216666666667], [1.53080706E12, 17107.516666666666], [1.530807E12, 17406.066666666666], [1.53080718E12, 16231.116666666667], [1.53080712E12, 17188.35], [1.53080682E12, 14880.383333333333], [1.5308073E12, 16036.7]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53080742E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 0.06666666666666667, "minX": 1.53080682E12, "maxY": 19822.2, "series": [{"data": [[1.53080724E12, 16659.716666666667], [1.53080694E12, 17840.516666666666], [1.53080742E12, 4484.85], [1.53080688E12, 19822.2], [1.53080736E12, 16357.216666666667], [1.53080706E12, 17044.633333333335], [1.530807E12, 17406.433333333334], [1.53080718E12, 16210.766666666666], [1.53080712E12, 17187.433333333334], [1.53080682E12, 14880.383333333333], [1.5308073E12, 16004.816666666668]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.53080688E12, 0.06666666666666667], [1.53080706E12, 2.966666666666667], [1.530807E12, 0.36666666666666664], [1.53080718E12, 0.9166666666666666]], "isOverall": false, "label": "504", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53080742E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 0.06666666666666667, "minX": 1.53080682E12, "maxY": 19822.2, "series": [{"data": [[1.53080724E12, 16659.716666666667], [1.53080694E12, 17840.516666666666], [1.53080742E12, 4484.85], [1.53080688E12, 19822.2], [1.53080736E12, 16357.216666666667], [1.53080706E12, 17044.633333333335], [1.530807E12, 17406.433333333334], [1.53080718E12, 16210.766666666666], [1.53080712E12, 17187.433333333334], [1.53080682E12, 14880.383333333333], [1.5308073E12, 16004.816666666668]], "isOverall": false, "label": "HTTP Request-success", "isController": false}, {"data": [[1.53080688E12, 0.06666666666666667], [1.53080706E12, 2.966666666666667], [1.530807E12, 0.36666666666666664], [1.53080718E12, 0.9166666666666666]], "isOverall": false, "label": "HTTP Request-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53080742E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
