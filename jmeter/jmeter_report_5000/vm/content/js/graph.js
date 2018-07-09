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
        data: {"result": {"minY": 0.0, "minX": 0.0, "maxY": 5129.0, "series": [{"data": [[0.0, 0.0], [0.1, 1.0], [0.2, 1.0], [0.3, 1.0], [0.4, 1.0], [0.5, 1.0], [0.6, 1.0], [0.7, 1.0], [0.8, 1.0], [0.9, 1.0], [1.0, 1.0], [1.1, 2.0], [1.2, 2.0], [1.3, 2.0], [1.4, 2.0], [1.5, 2.0], [1.6, 2.0], [1.7, 2.0], [1.8, 2.0], [1.9, 2.0], [2.0, 2.0], [2.1, 2.0], [2.2, 2.0], [2.3, 2.0], [2.4, 2.0], [2.5, 2.0], [2.6, 2.0], [2.7, 2.0], [2.8, 2.0], [2.9, 2.0], [3.0, 2.0], [3.1, 2.0], [3.2, 2.0], [3.3, 2.0], [3.4, 2.0], [3.5, 2.0], [3.6, 2.0], [3.7, 2.0], [3.8, 2.0], [3.9, 3.0], [4.0, 3.0], [4.1, 3.0], [4.2, 3.0], [4.3, 3.0], [4.4, 3.0], [4.5, 3.0], [4.6, 3.0], [4.7, 3.0], [4.8, 3.0], [4.9, 3.0], [5.0, 3.0], [5.1, 3.0], [5.2, 3.0], [5.3, 3.0], [5.4, 3.0], [5.5, 3.0], [5.6, 3.0], [5.7, 3.0], [5.8, 3.0], [5.9, 3.0], [6.0, 3.0], [6.1, 3.0], [6.2, 3.0], [6.3, 3.0], [6.4, 3.0], [6.5, 4.0], [6.6, 4.0], [6.7, 4.0], [6.8, 4.0], [6.9, 4.0], [7.0, 4.0], [7.1, 4.0], [7.2, 4.0], [7.3, 4.0], [7.4, 4.0], [7.5, 4.0], [7.6, 4.0], [7.7, 4.0], [7.8, 4.0], [7.9, 4.0], [8.0, 4.0], [8.1, 4.0], [8.2, 4.0], [8.3, 4.0], [8.4, 4.0], [8.5, 4.0], [8.6, 4.0], [8.7, 4.0], [8.8, 5.0], [8.9, 5.0], [9.0, 5.0], [9.1, 5.0], [9.2, 5.0], [9.3, 5.0], [9.4, 5.0], [9.5, 5.0], [9.6, 5.0], [9.7, 5.0], [9.8, 5.0], [9.9, 5.0], [10.0, 5.0], [10.1, 5.0], [10.2, 5.0], [10.3, 5.0], [10.4, 5.0], [10.5, 5.0], [10.6, 5.0], [10.7, 5.0], [10.8, 5.0], [10.9, 6.0], [11.0, 6.0], [11.1, 6.0], [11.2, 6.0], [11.3, 6.0], [11.4, 6.0], [11.5, 6.0], [11.6, 6.0], [11.7, 6.0], [11.8, 6.0], [11.9, 6.0], [12.0, 6.0], [12.1, 6.0], [12.2, 6.0], [12.3, 6.0], [12.4, 6.0], [12.5, 6.0], [12.6, 6.0], [12.7, 6.0], [12.8, 7.0], [12.9, 7.0], [13.0, 7.0], [13.1, 7.0], [13.2, 7.0], [13.3, 7.0], [13.4, 7.0], [13.5, 7.0], [13.6, 7.0], [13.7, 7.0], [13.8, 7.0], [13.9, 7.0], [14.0, 7.0], [14.1, 7.0], [14.2, 7.0], [14.3, 7.0], [14.4, 7.0], [14.5, 7.0], [14.6, 8.0], [14.7, 8.0], [14.8, 8.0], [14.9, 8.0], [15.0, 8.0], [15.1, 8.0], [15.2, 8.0], [15.3, 8.0], [15.4, 8.0], [15.5, 8.0], [15.6, 8.0], [15.7, 8.0], [15.8, 8.0], [15.9, 8.0], [16.0, 8.0], [16.1, 8.0], [16.2, 9.0], [16.3, 9.0], [16.4, 9.0], [16.5, 9.0], [16.6, 9.0], [16.7, 9.0], [16.8, 9.0], [16.9, 9.0], [17.0, 9.0], [17.1, 9.0], [17.2, 9.0], [17.3, 9.0], [17.4, 9.0], [17.5, 9.0], [17.6, 9.0], [17.7, 9.0], [17.8, 10.0], [17.9, 10.0], [18.0, 10.0], [18.1, 10.0], [18.2, 10.0], [18.3, 10.0], [18.4, 10.0], [18.5, 10.0], [18.6, 10.0], [18.7, 10.0], [18.8, 10.0], [18.9, 10.0], [19.0, 10.0], [19.1, 10.0], [19.2, 10.0], [19.3, 11.0], [19.4, 11.0], [19.5, 11.0], [19.6, 11.0], [19.7, 11.0], [19.8, 11.0], [19.9, 11.0], [20.0, 11.0], [20.1, 11.0], [20.2, 11.0], [20.3, 11.0], [20.4, 11.0], [20.5, 11.0], [20.6, 11.0], [20.7, 11.0], [20.8, 11.0], [20.9, 12.0], [21.0, 12.0], [21.1, 12.0], [21.2, 12.0], [21.3, 12.0], [21.4, 12.0], [21.5, 12.0], [21.6, 12.0], [21.7, 12.0], [21.8, 12.0], [21.9, 12.0], [22.0, 12.0], [22.1, 12.0], [22.2, 12.0], [22.3, 12.0], [22.4, 12.0], [22.5, 13.0], [22.6, 13.0], [22.7, 13.0], [22.8, 13.0], [22.9, 13.0], [23.0, 13.0], [23.1, 13.0], [23.2, 13.0], [23.3, 13.0], [23.4, 13.0], [23.5, 13.0], [23.6, 13.0], [23.7, 13.0], [23.8, 13.0], [23.9, 13.0], [24.0, 13.0], [24.1, 14.0], [24.2, 14.0], [24.3, 14.0], [24.4, 14.0], [24.5, 14.0], [24.6, 14.0], [24.7, 14.0], [24.8, 14.0], [24.9, 14.0], [25.0, 14.0], [25.1, 14.0], [25.2, 14.0], [25.3, 14.0], [25.4, 14.0], [25.5, 14.0], [25.6, 15.0], [25.7, 15.0], [25.8, 15.0], [25.9, 15.0], [26.0, 15.0], [26.1, 15.0], [26.2, 15.0], [26.3, 15.0], [26.4, 15.0], [26.5, 15.0], [26.6, 15.0], [26.7, 15.0], [26.8, 15.0], [26.9, 15.0], [27.0, 16.0], [27.1, 16.0], [27.2, 16.0], [27.3, 16.0], [27.4, 16.0], [27.5, 16.0], [27.6, 16.0], [27.7, 16.0], [27.8, 16.0], [27.9, 16.0], [28.0, 16.0], [28.1, 16.0], [28.2, 16.0], [28.3, 16.0], [28.4, 17.0], [28.5, 17.0], [28.6, 17.0], [28.7, 17.0], [28.8, 17.0], [28.9, 17.0], [29.0, 17.0], [29.1, 17.0], [29.2, 17.0], [29.3, 17.0], [29.4, 17.0], [29.5, 17.0], [29.6, 17.0], [29.7, 17.0], [29.8, 18.0], [29.9, 18.0], [30.0, 18.0], [30.1, 18.0], [30.2, 18.0], [30.3, 18.0], [30.4, 18.0], [30.5, 18.0], [30.6, 18.0], [30.7, 18.0], [30.8, 18.0], [30.9, 18.0], [31.0, 18.0], [31.1, 19.0], [31.2, 19.0], [31.3, 19.0], [31.4, 19.0], [31.5, 19.0], [31.6, 19.0], [31.7, 19.0], [31.8, 19.0], [31.9, 19.0], [32.0, 19.0], [32.1, 19.0], [32.2, 19.0], [32.3, 20.0], [32.4, 20.0], [32.5, 20.0], [32.6, 20.0], [32.7, 20.0], [32.8, 20.0], [32.9, 20.0], [33.0, 20.0], [33.1, 20.0], [33.2, 20.0], [33.3, 20.0], [33.4, 21.0], [33.5, 21.0], [33.6, 21.0], [33.7, 21.0], [33.8, 21.0], [33.9, 21.0], [34.0, 21.0], [34.1, 21.0], [34.2, 21.0], [34.3, 21.0], [34.4, 22.0], [34.5, 22.0], [34.6, 22.0], [34.7, 22.0], [34.8, 22.0], [34.9, 22.0], [35.0, 22.0], [35.1, 22.0], [35.2, 23.0], [35.3, 23.0], [35.4, 23.0], [35.5, 23.0], [35.6, 23.0], [35.7, 23.0], [35.8, 24.0], [35.9, 24.0], [36.0, 24.0], [36.1, 24.0], [36.2, 24.0], [36.3, 25.0], [36.4, 25.0], [36.5, 25.0], [36.6, 25.0], [36.7, 26.0], [36.8, 26.0], [36.9, 26.0], [37.0, 27.0], [37.1, 27.0], [37.2, 28.0], [37.3, 28.0], [37.4, 29.0], [37.5, 30.0], [37.6, 30.0], [37.7, 32.0], [37.8, 33.0], [37.9, 35.0], [38.0, 42.0], [38.1, 58.0], [38.2, 60.0], [38.3, 62.0], [38.4, 64.0], [38.5, 65.0], [38.6, 67.0], [38.7, 68.0], [38.8, 69.0], [38.9, 70.0], [39.0, 71.0], [39.1, 72.0], [39.2, 73.0], [39.3, 74.0], [39.4, 75.0], [39.5, 76.0], [39.6, 76.0], [39.7, 77.0], [39.8, 78.0], [39.9, 78.0], [40.0, 79.0], [40.1, 80.0], [40.2, 80.0], [40.3, 81.0], [40.4, 82.0], [40.5, 82.0], [40.6, 83.0], [40.7, 84.0], [40.8, 84.0], [40.9, 85.0], [41.0, 85.0], [41.1, 86.0], [41.2, 86.0], [41.3, 87.0], [41.4, 87.0], [41.5, 88.0], [41.6, 89.0], [41.7, 89.0], [41.8, 90.0], [41.9, 90.0], [42.0, 91.0], [42.1, 91.0], [42.2, 92.0], [42.3, 92.0], [42.4, 93.0], [42.5, 93.0], [42.6, 94.0], [42.7, 94.0], [42.8, 94.0], [42.9, 95.0], [43.0, 95.0], [43.1, 96.0], [43.2, 96.0], [43.3, 96.0], [43.4, 97.0], [43.5, 97.0], [43.6, 98.0], [43.7, 98.0], [43.8, 98.0], [43.9, 99.0], [44.0, 99.0], [44.1, 99.0], [44.2, 100.0], [44.3, 100.0], [44.4, 100.0], [44.5, 101.0], [44.6, 101.0], [44.7, 102.0], [44.8, 102.0], [44.9, 102.0], [45.0, 103.0], [45.1, 103.0], [45.2, 103.0], [45.3, 104.0], [45.4, 104.0], [45.5, 104.0], [45.6, 105.0], [45.7, 105.0], [45.8, 105.0], [45.9, 106.0], [46.0, 106.0], [46.1, 106.0], [46.2, 106.0], [46.3, 107.0], [46.4, 107.0], [46.5, 107.0], [46.6, 108.0], [46.7, 108.0], [46.8, 108.0], [46.9, 109.0], [47.0, 109.0], [47.1, 109.0], [47.2, 110.0], [47.3, 110.0], [47.4, 110.0], [47.5, 110.0], [47.6, 111.0], [47.7, 111.0], [47.8, 111.0], [47.9, 112.0], [48.0, 112.0], [48.1, 112.0], [48.2, 112.0], [48.3, 113.0], [48.4, 113.0], [48.5, 113.0], [48.6, 113.0], [48.7, 114.0], [48.8, 114.0], [48.9, 114.0], [49.0, 114.0], [49.1, 115.0], [49.2, 115.0], [49.3, 115.0], [49.4, 115.0], [49.5, 115.0], [49.6, 116.0], [49.7, 116.0], [49.8, 116.0], [49.9, 116.0], [50.0, 116.0], [50.1, 117.0], [50.2, 117.0], [50.3, 117.0], [50.4, 117.0], [50.5, 117.0], [50.6, 118.0], [50.7, 118.0], [50.8, 118.0], [50.9, 118.0], [51.0, 118.0], [51.1, 119.0], [51.2, 119.0], [51.3, 119.0], [51.4, 119.0], [51.5, 119.0], [51.6, 119.0], [51.7, 120.0], [51.8, 120.0], [51.9, 120.0], [52.0, 120.0], [52.1, 120.0], [52.2, 121.0], [52.3, 121.0], [52.4, 121.0], [52.5, 121.0], [52.6, 121.0], [52.7, 121.0], [52.8, 122.0], [52.9, 122.0], [53.0, 122.0], [53.1, 122.0], [53.2, 122.0], [53.3, 122.0], [53.4, 123.0], [53.5, 123.0], [53.6, 123.0], [53.7, 123.0], [53.8, 123.0], [53.9, 123.0], [54.0, 124.0], [54.1, 124.0], [54.2, 124.0], [54.3, 124.0], [54.4, 124.0], [54.5, 124.0], [54.6, 125.0], [54.7, 125.0], [54.8, 125.0], [54.9, 125.0], [55.0, 125.0], [55.1, 126.0], [55.2, 126.0], [55.3, 126.0], [55.4, 126.0], [55.5, 126.0], [55.6, 127.0], [55.7, 127.0], [55.8, 127.0], [55.9, 127.0], [56.0, 127.0], [56.1, 128.0], [56.2, 128.0], [56.3, 128.0], [56.4, 128.0], [56.5, 128.0], [56.6, 129.0], [56.7, 129.0], [56.8, 129.0], [56.9, 129.0], [57.0, 130.0], [57.1, 130.0], [57.2, 130.0], [57.3, 130.0], [57.4, 131.0], [57.5, 131.0], [57.6, 131.0], [57.7, 132.0], [57.8, 132.0], [57.9, 132.0], [58.0, 133.0], [58.1, 133.0], [58.2, 133.0], [58.3, 134.0], [58.4, 134.0], [58.5, 134.0], [58.6, 135.0], [58.7, 135.0], [58.8, 136.0], [58.9, 136.0], [59.0, 137.0], [59.1, 137.0], [59.2, 138.0], [59.3, 138.0], [59.4, 139.0], [59.5, 139.0], [59.6, 140.0], [59.7, 141.0], [59.8, 142.0], [59.9, 143.0], [60.0, 145.0], [60.1, 146.0], [60.2, 149.0], [60.3, 153.0], [60.4, 165.0], [60.5, 187.0], [60.6, 191.0], [60.7, 192.0], [60.8, 193.0], [60.9, 194.0], [61.0, 195.0], [61.1, 195.0], [61.2, 196.0], [61.3, 196.0], [61.4, 197.0], [61.5, 197.0], [61.6, 197.0], [61.7, 198.0], [61.8, 198.0], [61.9, 199.0], [62.0, 199.0], [62.1, 199.0], [62.2, 199.0], [62.3, 200.0], [62.4, 200.0], [62.5, 200.0], [62.6, 200.0], [62.7, 201.0], [62.8, 201.0], [62.9, 201.0], [63.0, 201.0], [63.1, 202.0], [63.2, 202.0], [63.3, 202.0], [63.4, 202.0], [63.5, 202.0], [63.6, 203.0], [63.7, 203.0], [63.8, 203.0], [63.9, 203.0], [64.0, 204.0], [64.1, 204.0], [64.2, 204.0], [64.3, 204.0], [64.4, 204.0], [64.5, 204.0], [64.6, 205.0], [64.7, 205.0], [64.8, 205.0], [64.9, 205.0], [65.0, 205.0], [65.1, 206.0], [65.2, 206.0], [65.3, 206.0], [65.4, 206.0], [65.5, 206.0], [65.6, 206.0], [65.7, 207.0], [65.8, 207.0], [65.9, 207.0], [66.0, 207.0], [66.1, 207.0], [66.2, 208.0], [66.3, 208.0], [66.4, 208.0], [66.5, 208.0], [66.6, 208.0], [66.7, 209.0], [66.8, 209.0], [66.9, 209.0], [67.0, 209.0], [67.1, 209.0], [67.2, 210.0], [67.3, 210.0], [67.4, 210.0], [67.5, 210.0], [67.6, 210.0], [67.7, 211.0], [67.8, 211.0], [67.9, 211.0], [68.0, 211.0], [68.1, 212.0], [68.2, 212.0], [68.3, 212.0], [68.4, 212.0], [68.5, 213.0], [68.6, 213.0], [68.7, 213.0], [68.8, 213.0], [68.9, 214.0], [69.0, 214.0], [69.1, 214.0], [69.2, 214.0], [69.3, 215.0], [69.4, 215.0], [69.5, 215.0], [69.6, 216.0], [69.7, 216.0], [69.8, 216.0], [69.9, 217.0], [70.0, 217.0], [70.1, 217.0], [70.2, 217.0], [70.3, 218.0], [70.4, 218.0], [70.5, 218.0], [70.6, 219.0], [70.7, 219.0], [70.8, 219.0], [70.9, 220.0], [71.0, 220.0], [71.1, 220.0], [71.2, 221.0], [71.3, 221.0], [71.4, 221.0], [71.5, 222.0], [71.6, 222.0], [71.7, 223.0], [71.8, 223.0], [71.9, 223.0], [72.0, 223.0], [72.1, 224.0], [72.2, 224.0], [72.3, 224.0], [72.4, 225.0], [72.5, 225.0], [72.6, 225.0], [72.7, 226.0], [72.8, 226.0], [72.9, 226.0], [73.0, 227.0], [73.1, 227.0], [73.2, 228.0], [73.3, 228.0], [73.4, 228.0], [73.5, 229.0], [73.6, 229.0], [73.7, 230.0], [73.8, 230.0], [73.9, 230.0], [74.0, 231.0], [74.1, 231.0], [74.2, 232.0], [74.3, 232.0], [74.4, 233.0], [74.5, 233.0], [74.6, 233.0], [74.7, 234.0], [74.8, 235.0], [74.9, 235.0], [75.0, 236.0], [75.1, 237.0], [75.2, 237.0], [75.3, 238.0], [75.4, 239.0], [75.5, 240.0], [75.6, 241.0], [75.7, 242.0], [75.8, 244.0], [75.9, 245.0], [76.0, 247.0], [76.1, 249.0], [76.2, 252.0], [76.3, 256.0], [76.4, 261.0], [76.5, 288.0], [76.6, 299.0], [76.7, 303.0], [76.8, 306.0], [76.9, 308.0], [77.0, 310.0], [77.1, 311.0], [77.2, 313.0], [77.3, 314.0], [77.4, 316.0], [77.5, 318.0], [77.6, 320.0], [77.7, 321.0], [77.8, 323.0], [77.9, 326.0], [78.0, 327.0], [78.1, 329.0], [78.2, 330.0], [78.3, 331.0], [78.4, 332.0], [78.5, 333.0], [78.6, 334.0], [78.7, 335.0], [78.8, 335.0], [78.9, 336.0], [79.0, 337.0], [79.1, 337.0], [79.2, 338.0], [79.3, 338.0], [79.4, 339.0], [79.5, 339.0], [79.6, 340.0], [79.7, 340.0], [79.8, 340.0], [79.9, 341.0], [80.0, 341.0], [80.1, 342.0], [80.2, 342.0], [80.3, 342.0], [80.4, 343.0], [80.5, 343.0], [80.6, 344.0], [80.7, 344.0], [80.8, 344.0], [80.9, 345.0], [81.0, 345.0], [81.1, 345.0], [81.2, 346.0], [81.3, 346.0], [81.4, 346.0], [81.5, 347.0], [81.6, 347.0], [81.7, 347.0], [81.8, 347.0], [81.9, 348.0], [82.0, 348.0], [82.1, 348.0], [82.2, 349.0], [82.3, 349.0], [82.4, 350.0], [82.5, 350.0], [82.6, 350.0], [82.7, 351.0], [82.8, 351.0], [82.9, 352.0], [83.0, 352.0], [83.1, 353.0], [83.2, 353.0], [83.3, 354.0], [83.4, 354.0], [83.5, 355.0], [83.6, 355.0], [83.7, 356.0], [83.8, 356.0], [83.9, 357.0], [84.0, 357.0], [84.1, 358.0], [84.2, 359.0], [84.3, 360.0], [84.4, 361.0], [84.5, 362.0], [84.6, 363.0], [84.7, 364.0], [84.8, 365.0], [84.9, 367.0], [85.0, 369.0], [85.1, 372.0], [85.2, 378.0], [85.3, 388.0], [85.4, 405.0], [85.5, 410.0], [85.6, 412.0], [85.7, 413.0], [85.8, 414.0], [85.9, 415.0], [86.0, 416.0], [86.1, 416.0], [86.2, 417.0], [86.3, 417.0], [86.4, 418.0], [86.5, 418.0], [86.6, 419.0], [86.7, 419.0], [86.8, 419.0], [86.9, 419.0], [87.0, 420.0], [87.1, 420.0], [87.2, 420.0], [87.3, 421.0], [87.4, 421.0], [87.5, 421.0], [87.6, 421.0], [87.7, 422.0], [87.8, 422.0], [87.9, 422.0], [88.0, 422.0], [88.1, 423.0], [88.2, 423.0], [88.3, 423.0], [88.4, 423.0], [88.5, 424.0], [88.6, 424.0], [88.7, 424.0], [88.8, 424.0], [88.9, 424.0], [89.0, 425.0], [89.1, 425.0], [89.2, 425.0], [89.3, 425.0], [89.4, 426.0], [89.5, 426.0], [89.6, 426.0], [89.7, 426.0], [89.8, 426.0], [89.9, 427.0], [90.0, 427.0], [90.1, 427.0], [90.2, 427.0], [90.3, 427.0], [90.4, 428.0], [90.5, 428.0], [90.6, 428.0], [90.7, 428.0], [90.8, 428.0], [90.9, 429.0], [91.0, 429.0], [91.1, 429.0], [91.2, 429.0], [91.3, 429.0], [91.4, 430.0], [91.5, 430.0], [91.6, 430.0], [91.7, 430.0], [91.8, 430.0], [91.9, 431.0], [92.0, 431.0], [92.1, 431.0], [92.2, 431.0], [92.3, 432.0], [92.4, 432.0], [92.5, 432.0], [92.6, 432.0], [92.7, 432.0], [92.8, 433.0], [92.9, 433.0], [93.0, 433.0], [93.1, 434.0], [93.2, 434.0], [93.3, 434.0], [93.4, 434.0], [93.5, 435.0], [93.6, 435.0], [93.7, 435.0], [93.8, 436.0], [93.9, 436.0], [94.0, 436.0], [94.1, 436.0], [94.2, 437.0], [94.3, 437.0], [94.4, 438.0], [94.5, 438.0], [94.6, 438.0], [94.7, 439.0], [94.8, 439.0], [94.9, 439.0], [95.0, 440.0], [95.1, 440.0], [95.2, 441.0], [95.3, 441.0], [95.4, 442.0], [95.5, 442.0], [95.6, 443.0], [95.7, 444.0], [95.8, 444.0], [95.9, 445.0], [96.0, 446.0], [96.1, 446.0], [96.2, 447.0], [96.3, 448.0], [96.4, 450.0], [96.5, 451.0], [96.6, 452.0], [96.7, 454.0], [96.8, 456.0], [96.9, 459.0], [97.0, 462.0], [97.1, 468.0], [97.2, 478.0], [97.3, 498.0], [97.4, 509.0], [97.5, 515.0], [97.6, 518.0], [97.7, 520.0], [97.8, 523.0], [97.9, 525.0], [98.0, 527.0], [98.1, 529.0], [98.2, 530.0], [98.3, 531.0], [98.4, 533.0], [98.5, 535.0], [98.6, 537.0], [98.7, 540.0], [98.8, 544.0], [98.9, 551.0], [99.0, 564.0], [99.1, 601.0], [99.2, 634.0], [99.3, 694.0], [99.4, 774.0], [99.5, 815.0], [99.6, 872.0], [99.7, 928.0], [99.8, 1004.0], [99.9, 1135.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 6073508.0, "series": [{"data": [[0.0, 6073508.0], [600.0, 29085.0], [700.0, 19479.0], [800.0, 29569.0], [900.0, 17937.0], [1000.0, 11760.0], [1100.0, 5236.0], [1200.0, 6691.0], [1300.0, 1555.0], [1400.0, 1173.0], [1500.0, 383.0], [100.0, 2494157.0], [1600.0, 215.0], [1700.0, 440.0], [1800.0, 441.0], [1900.0, 153.0], [2000.0, 38.0], [2100.0, 79.0], [2200.0, 60.0], [2300.0, 38.0], [2400.0, 33.0], [2500.0, 19.0], [2600.0, 15.0], [2700.0, 13.0], [2800.0, 13.0], [2900.0, 6.0], [3000.0, 7.0], [3100.0, 2.0], [200.0, 1977544.0], [3200.0, 6.0], [3300.0, 3.0], [3400.0, 1.0], [3500.0, 1.0], [4100.0, 1.0], [4500.0, 1.0], [300.0, 1204727.0], [5100.0, 1.0], [400.0, 1644857.0], [500.0, 246408.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 5100.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 1961.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1.3374409E7, "series": [{"data": [[1.0, 368090.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 21195.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 1.3374409E7]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1961.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 23.08965022619445, "minX": 1.53080478E12, "maxY": 5000.0, "series": [{"data": [[1.53080502E12, 3540.349506337072], [1.53080484E12, 538.7951808840659], [1.53080532E12, 5000.0], [1.53080514E12, 5000.0], [1.53080496E12, 2523.6356207257486], [1.53080478E12, 23.08965022619445], [1.53080526E12, 5000.0], [1.53080508E12, 4540.435329613427], [1.5308049E12, 1536.9643557559514], [1.53080538E12, 4995.2179149786125], [1.5308052E12, 5000.0]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53080538E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 0.8, "minX": 7.0, "maxY": 722.1486486486489, "series": [{"data": [[7.0, 3.854901960784311], [8.0, 1.4212962962962958], [10.0, 1.305630026809652], [11.0, 4.4714285714285715], [12.0, 1.2149532710280373], [13.0, 1.1760299625468165], [14.0, 1.1880597014925365], [15.0, 1.2441077441077444], [16.0, 1.2256097560975612], [17.0, 5.576687116564418], [18.0, 1.211111111111111], [19.0, 1.1879910213243516], [20.0, 1.231173380035027], [21.0, 9.065789473684212], [22.0, 2.2791946308724818], [23.0, 1.2125000000000006], [24.0, 1.2363960749330951], [25.0, 2.493827160493827], [26.0, 2.268888888888887], [27.0, 1.6603174603174622], [28.0, 2.326492537313439], [29.0, 1.3689655172413788], [30.0, 1.2590448625180897], [31.0, 3.6050632911392424], [32.0, 1.2463556851311948], [33.0, 1.2842535787321083], [34.0, 52.090909090909086], [35.0, 5.181603773584906], [36.0, 1.5678370177719987], [37.0, 2.6039999999999983], [38.0, 1.3613445378151265], [39.0, 13.333333333333332], [40.0, 57.888888888888886], [41.0, 1.395192845164897], [42.0, 2.6383850204798147], [43.0, 1.3726937269372703], [44.0, 1.7318132464712261], [45.0, 2.969271290605787], [46.0, 2.0672619047619056], [47.0, 6.661237785016283], [48.0, 1.5186567164179106], [49.0, 2.008259587020646], [50.0, 2.4488636363636376], [51.0, 1.482191780821918], [52.0, 3.974101921470349], [53.0, 1.4961928934010158], [54.0, 2.960915157292658], [55.0, 1.512987012987013], [56.0, 1.8620331950207492], [57.0, 6.954430379746833], [58.0, 1.588098558809857], [59.0, 5.608856088560885], [60.0, 2.8036998972250777], [61.0, 4.282418456642799], [62.0, 1.5982053838484562], [63.0, 2.455438596491226], [64.0, 2.7389251997095183], [65.0, 15.716666666666663], [66.0, 9.776435045317212], [67.0, 1.6984000000000008], [68.0, 1.2222222222222223], [69.0, 4.13785714285713], [70.0, 56.0], [71.0, 3.0952045133991564], [73.0, 8.207048458149778], [74.0, 2.20517168291649], [75.0, 2.8089967868618433], [76.0, 51.142857142857146], [77.0, 3.0402852049910845], [78.0, 44.533333333333346], [79.0, 3.252396166134197], [80.0, 1.88095238095238], [81.0, 7.107142857142855], [82.0, 3.5037688442211006], [83.0, 3.973598700243699], [84.0, 2.4782608695652173], [85.0, 2.2225063938618947], [86.0, 1.2857142857142858], [87.0, 5.42898032200358], [88.0, 56.0], [89.0, 3.7820694542877478], [90.0, 4.3914473684210416], [91.0, 2.841046277665998], [92.0, 57.0], [93.0, 4.548523206751058], [94.0, 4.345883326437732], [95.0, 2.8282753515914187], [97.0, 4.9042682926829295], [98.0, 3.1821247892074216], [99.0, 4.084577114427853], [100.0, 7.297213622291019], [101.0, 2.3243243243243237], [102.0, 2.4216524216524173], [103.0, 35.31372549019608], [104.0, 5.9977867945407715], [106.0, 4.278034887860465], [105.0, 57.0], [108.0, 4.766536964980523], [109.0, 9.578417266187053], [110.0, 2.429767441860465], [111.0, 3.2732502396931955], [112.0, 5.995018679950181], [113.0, 3.5032733224222645], [114.0, 4.899502840909079], [115.0, 17.5729442970822], [116.0, 3.2514332514332587], [117.0, 13.762548262548275], [118.0, 2.7236286919831256], [119.0, 2.849180327868854], [120.0, 27.215031315240083], [121.0, 2.6092657342657386], [122.0, 5.858867223769723], [123.0, 2.6782246879334273], [124.0, 5.853127474267607], [125.0, 2.824324324324325], [126.0, 3.6837349397590375], [127.0, 7.520423600605141], [128.0, 3.598238482384823], [129.0, 8.4271012006861], [130.0, 3.4856794637416164], [131.0, 5.357675111773466], [132.0, 10.977272727272727], [133.0, 8.55730129390019], [134.0, 5.690615835777137], [135.0, 3.975348338692388], [137.0, 7.30639269406395], [138.0, 3.871720116618078], [139.0, 8.234912394548996], [140.0, 3.840909090909091], [141.0, 6.387620719929762], [142.0, 4.466037735849059], [143.0, 55.0], [144.0, 5.92024320457797], [145.0, 6.267342799188639], [146.0, 5.905604719764011], [147.0, 57.51724137931035], [148.0, 4.611798980335026], [149.0, 5.63704496788009], [151.0, 5.902135231316731], [152.0, 11.965895249695494], [153.0, 3.0612244897959195], [154.0, 3.4831189710610935], [155.0, 7.364024173480253], [156.0, 10.474226804123713], [157.0, 2.895705521472393], [158.0, 3.667296786389409], [159.0, 5.921296296296289], [160.0, 57.0], [161.0, 7.010289990645462], [162.0, 4.850000000000001], [163.0, 6.285104870245298], [164.0, 47.891304347826114], [165.0, 3.5037993920972643], [166.0, 14.932761087267506], [167.0, 3.484805318138648], [168.0, 6.893745557924668], [170.0, 6.478863232682085], [172.0, 26.887795275590516], [171.0, 76.3529411764706], [173.0, 3.7112369337979065], [174.0, 12.25732217573222], [175.0, 4.059110629067246], [176.0, 6.8670212765957315], [178.0, 7.966955579631631], [179.0, 6.593861066235846], [180.0, 4.376119402985075], [181.0, 57.0], [182.0, 7.098046181172307], [183.0, 7.09871745044695], [184.0, 16.36432160804021], [185.0, 3.8369421122403846], [187.0, 14.274383708467333], [188.0, 4.109637939826618], [189.0, 9.20970094821297], [190.0, 57.0], [191.0, 7.306296691568825], [192.0, 11.930543933054391], [193.0, 4.159803318992008], [194.0, 55.6], [195.0, 9.699126092384539], [196.0, 6.997622585438357], [197.0, 4.9441087613293035], [198.0, 55.5], [199.0, 7.276626681206817], [200.0, 44.317365269461064], [201.0, 5.579025660096693], [202.0, 25.444234404536854], [203.0, 4.151937309534181], [204.0, 1.728260869565218], [205.0, 9.634530791788878], [206.0, 16.85423966362999], [207.0, 4.359067734887114], [209.0, 8.126023495906033], [210.0, 11.92545710267231], [211.0, 4.422202001819837], [212.0, 5.957295373665484], [213.0, 11.53714285714283], [214.0, 4.181208053691279], [215.0, 18.062500000000014], [216.0, 8.005991611743564], [217.0, 58.78571428571428], [218.0, 5.879640044994369], [220.0, 5.510978043912175], [219.0, 59.7483870967742], [221.0, 17.107810781078097], [222.0, 4.372670807453416], [223.0, 4.949612403100771], [224.0, 10.737411413651643], [225.0, 57.0], [226.0, 21.600301659125165], [227.0, 4.602415234556436], [228.0, 10.14745627980925], [229.0, 7.667785234899329], [230.0, 16.37550200803213], [231.0, 9.390606653620344], [232.0, 5.48463016330451], [233.0, 11.33997722095673], [234.0, 5.335216572504718], [236.0, 9.921438082556602], [237.0, 8.882411067193685], [238.0, 6.300859598853868], [239.0, 51.61650485436894], [240.0, 5.456233421750667], [241.0, 13.815909090909042], [242.0, 5.449826989619374], [243.0, 10.027926549349637], [244.0, 8.206896551724135], [245.0, 9.866511447419482], [246.0, 7.933333333333333], [247.0, 33.77546296296294], [248.0, 9.78985507246376], [249.0, 4.787234042553193], [250.0, 4.982475355969335], [251.0, 9.620091970286527], [252.0, 18.775757575757584], [253.0, 4.956469165659014], [254.0, 16.61893203883496], [255.0, 5.25565297646516], [256.0, 13.029271206690566], [258.0, 4.9584013050570945], [260.0, 5.988372093023257], [262.0, 24.46470588235294], [270.0, 42.958762886597945], [268.0, 56.0], [266.0, 13.438818565400839], [272.0, 1.1590909090909092], [274.0, 32.278947368421065], [276.0, 7.044198895027625], [278.0, 5.1580882352941195], [280.0, 30.465671641791026], [286.0, 10.911190053285978], [284.0, 16.971647509578514], [282.0, 10.730700818214135], [288.0, 11.677648040033338], [290.0, 18.62022339800116], [292.0, 11.31370487206448], [294.0, 5.879696074292951], [296.0, 8.006269592476492], [302.0, 16.689953426480336], [300.0, 11.86384642730183], [298.0, 12.187277896233134], [304.0, 5.590163934426228], [306.0, 6.685252525252539], [308.0, 11.890513552068457], [310.0, 12.000357909806691], [312.0, 15.411807580174955], [318.0, 6.465336134453789], [316.0, 12.77412199630314], [314.0, 12.459950160199348], [320.0, 12.0346083788707], [322.0, 69.25], [324.0, 6.572805139186296], [326.0, 13.199571581578027], [328.0, 7.021010789324247], [334.0, 8.220895522388059], [332.0, 9.367105263157887], [330.0, 12.605920114122682], [336.0, 59.91818181818181], [338.0, 57.0], [340.0, 1.945205479452055], [342.0, 9.654618473895585], [344.0, 1.0], [350.0, 6.985992996498237], [348.0, 10.47731605032404], [346.0, 13.60191570881228], [352.0, 13.831280328480814], [354.0, 7.073383084577112], [356.0, 18.943643512450787], [358.0, 2.9142857142857164], [360.0, 26.210580912863104], [366.0, 37.51768488745981], [362.0, 1.1060606060606062], [368.0, 23.69837189374467], [370.0, 7.654178674351578], [372.0, 8.440903054448883], [374.0, 7.108150470219434], [376.0, 7.411408815903201], [380.0, 7.538086532602086], [382.0, 20.809611829944572], [378.0, 7.871295512277739], [386.0, 15.939393939393968], [384.0, 23.03131115459879], [396.0, 11.595562475671477], [398.0, 7.893895348837209], [388.0, 18.47023511755877], [390.0, 20.266970618034467], [392.0, 16.30613090306545], [394.0, 16.056665455866355], [400.0, 8.628318584070794], [402.0, 8.445923460898495], [404.0, 17.054121863799274], [406.0, 9.892018779342727], [408.0, 9.378658262044151], [414.0, 8.426395939086296], [412.0, 17.281355932203397], [410.0, 12.337455830388691], [428.0, 49.046400000000006], [418.0, 10.025229357798146], [430.0, 2.0], [420.0, 18.042151746286628], [422.0, 15.765950520833346], [424.0, 15.636603898249113], [426.0, 11.605105105105098], [432.0, 8.944636678200686], [434.0, 24.622311827956995], [436.0, 18.000485436893225], [438.0, 16.98400284393881], [440.0, 18.03748535728231], [446.0, 18.004962779156333], [444.0, 49.53333333333339], [442.0, 22.713760117733653], [448.0, 94.48351648351648], [450.0, 19.784928309436484], [452.0, 8.507035860190625], [454.0, 18.40865212727929], [456.0, 17.779636881452422], [462.0, 8.721281741233359], [460.0, 18.357270453733467], [458.0, 8.253731343283581], [464.0, 7.673728813559311], [466.0, 10.99214145383103], [468.0, 20.827872634979236], [470.0, 18.404719342152266], [472.0, 30.815462753950335], [478.0, 10.266574585635386], [476.0, 44.63821138211384], [474.0, 10.042682926829269], [480.0, 7.56764705882353], [482.0, 7.195804195804193], [484.0, 28.08967789165442], [486.0, 8.775490665390134], [492.0, 9.810559006211186], [490.0, 13.165540540540531], [496.0, 14.841049382716054], [498.0, 44.08333333333334], [500.0, 2.2788461538461533], [502.0, 49.018707482993165], [504.0, 35.641148325358856], [510.0, 19.98674110258187], [508.0, 10.14756944444444], [506.0, 27.550620509470868], [512.0, 23.75695461200586], [524.0, 24.80327868852453], [516.0, 21.521165048543683], [528.0, 10.587412587412592], [540.0, 12.382290562036088], [536.0, 26.60955852571885], [532.0, 11.645508337816027], [520.0, 20.506084466714398], [544.0, 9.660749506903354], [556.0, 59.0], [548.0, 11.070977917981077], [560.0, 49.85130111524166], [572.0, 37.02474402730372], [568.0, 30.4337427278604], [564.0, 45.60977777777779], [552.0, 8.446808510638299], [576.0, 19.181703734788055], [588.0, 27.109134045077102], [580.0, 27.141951837769348], [600.0, 27.021881838074425], [604.0, 89.5384615384615], [592.0, 41.41452442159381], [596.0, 10.771466314398957], [584.0, 11.8503937007874], [608.0, 50.65153234960273], [620.0, 12.34583901773531], [612.0, 45.51663585951932], [624.0, 27.265074868474326], [632.0, 50.08717948717953], [628.0, 28.431180968564092], [616.0, 13.531598513011145], [644.0, 58.75], [640.0, 15.935185185185182], [652.0, 3.1481481481481484], [664.0, 9.454545454545455], [668.0, 21.009633911368], [660.0, 67.0], [672.0, 18.976503759398543], [684.0, 28.07817002881845], [676.0, 26.217048710601695], [696.0, 30.68108108108111], [700.0, 13.510013351134837], [688.0, 29.7422979340341], [692.0, 36.55322455322461], [680.0, 27.516894320632606], [704.0, 22.8637515842839], [708.0, 38.04486062717776], [716.0, 19.30769230769232], [728.0, 30.632352941176446], [732.0, 39.01393939393937], [720.0, 28.00816761363644], [724.0, 40.617050067658965], [712.0, 15.253416149068329], [736.0, 16.139712108382735], [748.0, 16.597394908229738], [740.0, 14.670384138785622], [752.0, 5.184615384615385], [764.0, 50.43667296786387], [760.0, 54.01834189288339], [744.0, 15.714285714285717], [784.0, 56.0], [796.0, 58.57979953739386], [792.0, 51.07733333333338], [788.0, 54.50778816199378], [776.0, 29.153846153846146], [780.0, 60.78723404255319], [800.0, 32.637931034482904], [812.0, 18.023521932612827], [804.0, 36.2486187845304], [816.0, 27.447382622773848], [828.0, 35.404438964241585], [824.0, 24.451219512195113], [820.0, 28.08800000000002], [808.0, 27.478685156651256], [832.0, 45.32360570687413], [844.0, 18.43057050592037], [836.0, 31.389978213507607], [848.0, 43.707334785766115], [860.0, 16.534482758620708], [856.0, 16.918181818181818], [852.0, 22.20542635658911], [840.0, 32.869085173501595], [864.0, 13.00378787878787], [876.0, 47.892326732673325], [868.0, 51.51428571428572], [888.0, 39.265044247787664], [892.0, 30.832152588555882], [880.0, 38.90395480225991], [884.0, 54.92087912087903], [872.0, 57.45881552076248], [896.0, 31.502920870950582], [908.0, 39.769805680119525], [900.0, 46.909240924092316], [912.0, 46.69404069767433], [924.0, 59.4054054054054], [920.0, 22.70588235294117], [916.0, 44.35217391304348], [904.0, 34.497869043006645], [928.0, 52.70012391573729], [940.0, 49.83992640294391], [952.0, 37.330885529157655], [956.0, 44.32667047401488], [944.0, 42.19612163948872], [948.0, 47.15869017632244], [936.0, 49.850206138341804], [960.0, 16.81609195402299], [972.0, 30.587234042553227], [964.0, 23.408088235294116], [976.0, 22.08], [988.0, 33.22867513611617], [984.0, 13.12849162011173], [980.0, 51.812154696132616], [968.0, 23.71554770318019], [992.0, 22.25842696629214], [1004.0, 23.57484076433124], [996.0, 42.43238095238094], [1008.0, 44.0090771558245], [1020.0, 39.867046533713165], [1016.0, 40.64506734619588], [1012.0, 44.05439642324894], [1000.0, 56.26569678407348], [1024.0, 60.9665970772443], [1048.0, 48.867009551800166], [1032.0, 44.62622149837132], [1056.0, 40.57461201750891], [1080.0, 49.11412429378527], [1072.0, 51.54046242774571], [1064.0, 39.69676806083644], [1040.0, 41.800149700598816], [1088.0, 29.796572280178786], [1112.0, 68.0], [1096.0, 47.04536585365851], [1120.0, 22.36521739130436], [1144.0, 49.99367755532135], [1136.0, 25.421836228287834], [1128.0, 63.706333973128615], [1104.0, 52.54019991308121], [1152.0, 44.120859119038954], [1176.0, 46.76622902990522], [1160.0, 44.93779677113003], [1184.0, 54.84047109207709], [1208.0, 23.334515366430278], [1200.0, 47.8516771488469], [1192.0, 54.27619047619054], [1168.0, 53.628002745367134], [1216.0, 78.0], [1240.0, 50.74851936218678], [1224.0, 58.494299128101964], [1248.0, 53.39765845781174], [1272.0, 60.36821554080444], [1264.0, 43.269616026711134], [1256.0, 52.34472656250004], [1232.0, 50.758750000000035], [1336.0, 62.10824742268039], [1288.0, 49.59111559818267], [1328.0, 61.44208494208491], [1320.0, 65.6745589600741], [1296.0, 118.28846153846153], [1304.0, 63.722832722832734], [1344.0, 53.74218749999999], [1368.0, 63.17490952955353], [1352.0, 73.90890052356018], [1376.0, 26.517580872011262], [1400.0, 56.940199335548094], [1392.0, 55.151910531220885], [1384.0, 67.8526785714286], [1360.0, 25.534743202416937], [1408.0, 22.361111111111107], [1432.0, 26.10062893081761], [1416.0, 66.58465011286692], [1440.0, 67.39987038237203], [1464.0, 60.478165137614724], [1456.0, 58.77516985793708], [1448.0, 63.56689483509646], [1424.0, 49.705161854768065], [1472.0, 59.238798856053386], [1496.0, 65.39803036520316], [1480.0, 62.344262295082004], [1504.0, 30.72815533980583], [1520.0, 71.26535626535637], [1512.0, 37.00873362445417], [1536.0, 57.034178610804865], [1560.0, 41.5], [1544.0, 63.84541062801943], [1568.0, 58.36070060207996], [1592.0, 67.86391673091744], [1584.0, 51.19491525423727], [1576.0, 71.49786780383816], [1552.0, 77.30682232761782], [1600.0, 70.91144868469796], [1624.0, 65.4099378881988], [1608.0, 65.57999999999986], [1632.0, 96.3811693242217], [1656.0, 69.69479927007312], [1648.0, 65.43509528946414], [1640.0, 5.0129198966408275], [1616.0, 78.30294450736129], [1664.0, 49.986577181208034], [1672.0, 66.30487804878041], [1680.0, 68.82463928967819], [1688.0, 65.2419354838709], [1696.0, 81.97404063205421], [1720.0, 64.4397420395003], [1712.0, 62.028884462151375], [1704.0, 70.73357015985788], [1728.0, 87.77813390313398], [1736.0, 113.88613013698617], [1744.0, 75.02230483271353], [1752.0, 57.97081413210456], [1760.0, 81.59943977591026], [1784.0, 128.64779874213835], [1776.0, 69.19862752573385], [1768.0, 59.49279379157429], [1792.0, 67.10768367919245], [1800.0, 65.75713184271396], [1808.0, 69.29251700680273], [1816.0, 75.15276273022755], [1824.0, 133.9209486166008], [1848.0, 65.7097264437691], [1840.0, 150.69196428571433], [1832.0, 93.2236842105263], [1856.0, 72.11467054969077], [1864.0, 31.597402597402603], [1872.0, 98.03994845360816], [1880.0, 73.0167438546492], [1888.0, 54.91913043478267], [1912.0, 62.571988795518266], [1904.0, 71.3085106382979], [1896.0, 90.50855838721941], [1920.0, 82.39478114478112], [1928.0, 69.88201363398], [1936.0, 83.34806629834252], [1944.0, 61.27710843373491], [1952.0, 60.0952380952381], [1976.0, 117.96407185628738], [1968.0, 60.06673728813555], [1960.0, 77.3891660727013], [1984.0, 97.66145833333336], [1992.0, 82.06612749762131], [2000.0, 62.138248847926256], [2008.0, 102.05833333333337], [2016.0, 118.54354354354349], [2040.0, 93.04143544210132], [2032.0, 12.506531204644418], [2024.0, 57.57781753130588], [2048.0, 85.75380710659906], [2064.0, 43.26061997703788], [2080.0, 101.23792800702357], [2096.0, 82.92592592592595], [2112.0, 84.2367920942607], [2160.0, 89.08301886792452], [2144.0, 85.89965277777792], [2128.0, 83.50445632798574], [2176.0, 132.00503778337517], [2288.0, 148.34193548387097], [2208.0, 96.15398886827454], [2224.0, 87.14109589041102], [2240.0, 102.63695238095228], [2256.0, 205.0], [2304.0, 68.64627151051624], [2320.0, 129.21915285451206], [2336.0, 99.46732673267331], [2352.0, 86.71464753060359], [2368.0, 73.86486486486478], [2416.0, 64.88187702265375], [2400.0, 112.24602026049205], [2384.0, 101.9034620505992], [2432.0, 81.96793002915459], [2448.0, 29.548117154811706], [2464.0, 120.9686316928068], [2480.0, 135.08520710059165], [2496.0, 72.9768185451639], [2544.0, 85.04918032786888], [2528.0, 68.65090090090092], [2512.0, 100.31190926275987], [2560.0, 121.77057453416118], [2656.0, 105.65657439446379], [2672.0, 175.57605177993545], [2592.0, 135.13718411552352], [2608.0, 166.0566572237961], [2640.0, 103.3369098712447], [2784.0, 221.8986486486488], [2704.0, 95.55153949129856], [2800.0, 99.10714285714288], [2736.0, 126.67049368541909], [2752.0, 134.98981324278458], [2768.0, 163.31059245960483], [2912.0, 137.11323641928095], [2816.0, 136.03369122547173], [2848.0, 242.3589743589744], [2864.0, 100.41830985915486], [2880.0, 107.87234042553193], [2896.0, 141.56341140079547], [2928.0, 352.875], [2944.0, 213.0], [2992.0, 104.05987261146497], [3008.0, 191.21914132379277], [3056.0, 163.37822878228783], [3040.0, 214.3846153846154], [3024.0, 215.0], [3088.0, 126.2245475113121], [3120.0, 153.58302583025846], [3152.0, 201.8652094717669], [3168.0, 108.6737704918033], [3184.0, 72.92727272727265], [3136.0, 213.66666666666666], [3216.0, 123.20644599303118], [3232.0, 142.2850759606791], [3264.0, 154.1479174776173], [3312.0, 154.65421273351112], [3296.0, 161.63646922183477], [3248.0, 211.0], [3200.0, 208.0], [3328.0, 154.29976671850716], [3344.0, 159.42769701606755], [3360.0, 159.0857814336074], [3376.0, 151.21571498291883], [3392.0, 178.36363636363635], [3408.0, 160.26715176715166], [3424.0, 164.04858622062937], [3440.0, 140.26737756714053], [3456.0, 182.89877904686907], [3472.0, 87.63300386764077], [3488.0, 169.04983108108138], [3504.0, 89.80891719745217], [3520.0, 255.1452550032277], [3536.0, 160.78624174115777], [3552.0, 342.6666666666667], [3568.0, 155.95878274268145], [3600.0, 135.98857142857145], [3616.0, 82.80377754459606], [3632.0, 179.80338849487805], [3648.0, 161.92323232323238], [3664.0, 156.33293978748523], [3680.0, 154.53571428571428], [3696.0, 155.9647651006713], [3584.0, 409.0], [3712.0, 163.57098525989124], [3728.0, 283.88612565445015], [3744.0, 149.36681222707404], [3760.0, 164.255707762557], [3792.0, 189.84892638036806], [3808.0, 87.97979323308272], [3824.0, 155.61719457013595], [3776.0, 402.75], [3840.0, 218.46565495207653], [3856.0, 207.7446808510638], [3872.0, 158.4695562435501], [3888.0, 219.34624233128795], [3904.0, 253.8568611987382], [3936.0, 288.38334858188495], [3952.0, 267.9391304347824], [3920.0, 399.0], [3968.0, 120.67332549941244], [3984.0, 236.9895424836602], [4000.0, 186.8274111675127], [4016.0, 248.09992069785898], [4032.0, 223.49484536082463], [4048.0, 176.89039812646368], [4064.0, 205.41291291291282], [4080.0, 246.0581973030514], [4096.0, 134.61176470588208], [4128.0, 344.13402061855646], [4160.0, 94.76309044306107], [4192.0, 406.0], [4224.0, 185.82786885245898], [4288.0, 231.69157392686822], [4320.0, 343.8174603174603], [4256.0, 390.75], [4416.0, 323.0], [4448.0, 413.0], [4480.0, 96.05253623188409], [4544.0, 113.85815899581578], [4576.0, 86.33491012298953], [4512.0, 227.6], [4608.0, 302.29411764705884], [4640.0, 103.07976653696504], [4672.0, 179.60061601642704], [4704.0, 253.5621364357482], [4736.0, 230.2942583732058], [4768.0, 354.8367346938775], [4832.0, 321.33146964856195], [4864.0, 250.62975778546718], [4896.0, 198.92000000000007], [4928.0, 251.86263947672126], [4960.0, 214.87205117952865], [4992.0, 177.68457405986177], [4097.0, 88.88560885608858], [4129.0, 115.63355201499533], [4193.0, 159.69112691875742], [4225.0, 160.1128349788432], [4257.0, 258.98624999999936], [4289.0, 146.31894305917382], [4321.0, 278.2010398613515], [4353.0, 269.431808984216], [4385.0, 168.15072685539363], [4417.0, 269.0388185654015], [4449.0, 201.71984983575788], [4481.0, 201.32545090180383], [4513.0, 165.2914156626506], [4545.0, 353.206919945725], [4577.0, 227.32035811599866], [4609.0, 218.1678115799801], [4641.0, 164.93600930773718], [4673.0, 227.0680991735544], [4705.0, 138.446621621622], [4737.0, 423.0], [4769.0, 223.05225933202345], [4801.0, 253.7893643539673], [4833.0, 141.20777160983366], [4865.0, 277.38960244648376], [4897.0, 195.4220499569338], [4929.0, 115.0], [4961.0, 305.49056603773556], [4993.0, 178.1437549096625], [2145.0, 79.16551426102001], [2065.0, 86.8931955211026], [2161.0, 61.38898756660742], [2081.0, 77.99038461538461], [2097.0, 87.19706422018356], [2113.0, 90.82674335010785], [2129.0, 70.44010249839833], [2177.0, 84.07360672975815], [2193.0, 110.20362674726107], [2209.0, 110.68369351669949], [2225.0, 113.39385474860323], [2289.0, 96.32755203171456], [2273.0, 105.54579863739593], [2257.0, 99.0904617713852], [2305.0, 109.80106888361038], [2321.0, 89.86571719226843], [2337.0, 100.99371069182385], [2353.0, 82.1674641148325], [2369.0, 111.99577039274939], [2417.0, 110.26572008113597], [2401.0, 87.86238532110092], [2385.0, 121.09090909090908], [2433.0, 129.16609783845277], [2449.0, 81.09307782557673], [2465.0, 95.1751412429381], [2481.0, 71.2970396387355], [2497.0, 78.10789049919488], [2545.0, 157.15405405405397], [2529.0, 105.4496738117427], [2513.0, 186.51987767584095], [2657.0, 100.72303921568631], [2577.0, 125.94207901802832], [2673.0, 117.20117105813462], [2593.0, 98.91729957805893], [2609.0, 105.08131868131876], [2625.0, 117.84661654135351], [2641.0, 127.57338129496387], [2689.0, 142.94968017057573], [2705.0, 120.14768413059984], [2721.0, 143.94117647058835], [2753.0, 88.61221945137157], [2769.0, 104.57648630594524], [2785.0, 127.9095098449937], [2801.0, 132.06625766871184], [2913.0, 234.0], [2833.0, 149.39888494678146], [2817.0, 369.2857142857143], [2929.0, 139.52840466926068], [2849.0, 159.71844660194193], [2865.0, 186.27104722792615], [2881.0, 181.10562180579203], [2897.0, 119.2302158273381], [2945.0, 126.34867394695817], [2961.0, 132.53301683211032], [2977.0, 129.37079091620961], [2993.0, 182.36507936507917], [3009.0, 101.30131004366811], [3057.0, 145.53978357733925], [3041.0, 153.9616576297442], [3025.0, 137.00804289544237], [3073.0, 139.7320574162678], [3089.0, 141.4601837672282], [3105.0, 174.522091609242], [3121.0, 92.76385542168673], [3137.0, 146.2489595157016], [3185.0, 148.00806776926186], [3169.0, 168.57362784471226], [3153.0, 130.96464989802848], [3201.0, 173.18448023426063], [3217.0, 152.7952968388589], [3233.0, 165.67469879518066], [3249.0, 152.31816398587694], [3265.0, 161.2783938814532], [3281.0, 162.71339347675237], [3297.0, 212.00000000000003], [3329.0, 181.8485237483954], [3361.0, 161.43749999999974], [3393.0, 157.7492323439101], [3409.0, 147.89650872817964], [3441.0, 131.75], [3425.0, 428.25], [3345.0, 211.0], [3457.0, 252.42187499999997], [3473.0, 146.6185567010309], [3489.0, 160.7722592368262], [3505.0, 300.9764560099131], [3521.0, 215.89009900990078], [3537.0, 251.19483101391637], [3569.0, 410.75], [3553.0, 409.0], [3585.0, 154.27984918307462], [3601.0, 84.08091993185715], [3617.0, 87.91811414392069], [3665.0, 329.2439024390244], [3681.0, 89.04598567659248], [3697.0, 90.67058823529428], [3649.0, 403.0], [3633.0, 406.6666666666667], [3729.0, 271.52307692307664], [3761.0, 182.05582137161076], [3777.0, 234.6456724908568], [3793.0, 175.0752688172046], [3809.0, 144.76870748299302], [3825.0, 210.6363636363637], [3745.0, 407.0], [3713.0, 407.0], [3857.0, 265.29571489181114], [3873.0, 80.65540927303945], [3889.0, 354.5], [3905.0, 105.26220432813288], [3921.0, 234.26081730769215], [3937.0, 101.29139072847684], [3953.0, 218.2065878983168], [3841.0, 403.0], [4001.0, 318.5092024539877], [4017.0, 109.90313075506432], [4033.0, 177.00345849802378], [4049.0, 216.0934782608696], [4065.0, 188.63601532567043], [4081.0, 138.04709840201858], [3969.0, 397.0], [4098.0, 231.39304278288705], [4162.0, 228.16385068762267], [4226.0, 95.1450803212851], [4258.0, 190.7002827521207], [4290.0, 360.5], [4322.0, 118.33221726190472], [4130.0, 395.0], [4354.0, 151.21120853984024], [4386.0, 201.77662544874337], [4418.0, 105.01570210856866], [4450.0, 218.39920634920634], [4482.0, 404.26129032258046], [4514.0, 166.13385826771642], [4546.0, 226.16666666666666], [4610.0, 95.39583333333331], [4642.0, 241.71417624521058], [4674.0, 111.55999999999999], [4706.0, 224.74908869987874], [4738.0, 229.62255639097765], [4802.0, 334.18790849673206], [4834.0, 175.43753111000527], [4866.0, 94.85714285714295], [4898.0, 291.2383838383833], [4930.0, 245.49485384932072], [4962.0, 126.87773722627732], [4994.0, 240.5], [4131.0, 224.87577128753568], [4195.0, 262.5288041319034], [4227.0, 240.95438996579264], [4259.0, 91.9127134724857], [4291.0, 276.2663609837434], [4323.0, 387.0], [4163.0, 394.0], [4419.0, 82.07276507276507], [4451.0, 320.2833333333333], [4483.0, 136.15912408759155], [4515.0, 127.89312977099236], [4547.0, 161.16392830470517], [4579.0, 230.75814138204944], [4611.0, 249.0476673427991], [4643.0, 234.2477626000939], [4675.0, 88.0867052023121], [4707.0, 318.5996621621616], [4739.0, 92.03892215568862], [4771.0, 190.16374269005883], [4803.0, 87.52065704330504], [4835.0, 237.84153896315556], [4867.0, 193.38709677419357], [4899.0, 199.01430429128735], [4963.0, 189.0], [4995.0, 241.82176287051388], [4931.0, 206.0], [1033.0, 38.14161490683224], [1025.0, 32.75392670157069], [1049.0, 32.89583333333333], [1057.0, 74.31622516556294], [1081.0, 45.707147375079046], [1073.0, 64.02020202020205], [1089.0, 0.96], [1113.0, 57.36943272386316], [1097.0, 70.52631578947367], [1137.0, 45.94204737732662], [1145.0, 40.70900537634408], [1121.0, 44.1147005444647], [1129.0, 28.25064157399487], [1105.0, 54.87370838117112], [1153.0, 61.35933333333333], [1177.0, 53.54750705550332], [1161.0, 53.78959810874704], [1185.0, 41.784669397308384], [1209.0, 62.93683187560742], [1201.0, 56.07251032583756], [1193.0, 53.79898218829517], [1169.0, 36.726688102893924], [1217.0, 54.28555514296312], [1241.0, 68.21478060046189], [1225.0, 48.280730897010045], [1249.0, 25.47307692307691], [1273.0, 54.811777076761274], [1265.0, 66.15362731152206], [1257.0, 51.869863013698634], [1233.0, 22.575539568345324], [1281.0, 98.50370370370372], [1305.0, 61.36607892527275], [1289.0, 57.680099194048296], [1329.0, 60.77887139107613], [1337.0, 64.05485040797825], [1313.0, 54.797487065779926], [1321.0, 47.09686411149824], [1297.0, 59.49316508937955], [1345.0, 52.52117863720074], [1369.0, 49.09523809523808], [1353.0, 40.9838862559242], [1377.0, 56.722960725075545], [1401.0, 56.18601895734592], [1393.0, 53.46556741028133], [1385.0, 60.143942008974804], [1361.0, 61.594583670169754], [1409.0, 12.34375], [1433.0, 75.57863636363632], [1417.0, 61.37874659400552], [1441.0, 41.117322834645684], [1457.0, 67.85012919896643], [1449.0, 92.51070336391432], [1425.0, 61.27989821882954], [1473.0, 79.73920265780723], [1497.0, 35.12462006079024], [1481.0, 62.48642533936663], [1505.0, 61.99605293707927], [1529.0, 61.161431701972184], [1521.0, 54.632344386270965], [1513.0, 68.48354876615767], [1489.0, 58.365050651230085], [1537.0, 69.974025974026], [1569.0, 66.42122538293232], [1585.0, 68.26011560693637], [1577.0, 63.59073935772966], [1553.0, 37.325779036827186], [1561.0, 71.46102941176461], [1609.0, 76.63719115734732], [1601.0, 58.8332135154565], [1649.0, 58.26879462410744], [1657.0, 72.76067270375155], [1617.0, 56.76682926829265], [1625.0, 69.50593824228032], [1633.0, 70.90078515346174], [1641.0, 73.78703703703712], [1665.0, 69.94746059544654], [1673.0, 78.45021855269565], [1681.0, 27.14765100671141], [1689.0, 68.23999999999995], [1697.0, 63.704900938477486], [1713.0, 78.62053369516079], [1705.0, 72.43382789317485], [1729.0, 59.71800947867308], [1737.0, 61.69544235924929], [1745.0, 77.987684729064], [1753.0, 64.77123552123554], [1761.0, 71.0], [1777.0, 68.54491525423732], [1785.0, 67.69284603421454], [1769.0, 77.79649890590817], [1793.0, 99.75277777777777], [1801.0, 82.7797202797204], [1809.0, 82.12263826863615], [1817.0, 70.58376963350788], [1825.0, 70.76319875776393], [1849.0, 97.98832684824895], [1841.0, 75.2498834498835], [1833.0, 60.13834951456309], [1905.0, 85.16279069767448], [1857.0, 63.840226628895124], [1913.0, 102.49839572192515], [1873.0, 38.12990409764602], [1881.0, 77.0], [1889.0, 84.95222034851032], [1897.0, 41.191956124314444], [1921.0, 74.99075500770425], [1929.0, 105.65015479876162], [1937.0, 56.495843230403786], [1945.0, 62.563218390804614], [1953.0, 56.67008196721312], [1977.0, 143.37549407114633], [1969.0, 94.7828612926652], [1961.0, 67.08921755725193], [1985.0, 69.1634615384616], [1993.0, 16.023310023310025], [2001.0, 117.74136008918612], [2009.0, 5.777777777777777], [2017.0, 6.730769230769231], [2041.0, 146.29452054794515], [2033.0, 69.27482876712311], [2025.0, 85.4213620774131], [2050.0, 125.04553119730176], [2066.0, 88.18868739205529], [2082.0, 85.48642172523977], [2098.0, 95.3248945147679], [2114.0, 9.0], [2162.0, 57.28991596638654], [2146.0, 84.15555555555555], [2130.0, 103.97654320987647], [2194.0, 200.0], [2178.0, 70.6715431807457], [2274.0, 94.0], [2290.0, 62.5856890459364], [2210.0, 90.49136442141614], [2226.0, 82.8148387096776], [2242.0, 115.96136363636366], [2306.0, 72.37967914438505], [2322.0, 76.23343848580456], [2338.0, 95.15060240963844], [2354.0, 85.23995826812715], [2370.0, 83.89564149785143], [2418.0, 99.05571370475798], [2402.0, 82.9074074074074], [2386.0, 84.16494845360828], [2434.0, 91.73702983138759], [2450.0, 144.76703296703283], [2466.0, 105.75658389766745], [2482.0, 129.6278222869625], [2498.0, 111.18882175226577], [2546.0, 98.76136363636364], [2530.0, 66.87563884156737], [2514.0, 167.34663341645884], [2578.0, 140.48924180327865], [2594.0, 132.41219070609563], [2610.0, 151.5], [2642.0, 101.66172839506174], [2658.0, 121.17085235920828], [2674.0, 121.77150435771141], [2690.0, 135.13287981859472], [2706.0, 211.66666666666666], [2802.0, 106.4269311064718], [2738.0, 155.5737704918034], [2754.0, 154.2564102564103], [2770.0, 170.12920168067188], [2834.0, 135.17329093799677], [2818.0, 126.11367942402389], [2914.0, 133.94672349493845], [2930.0, 152.2399176954732], [2850.0, 110.03184713375795], [2866.0, 143.10616229408168], [2882.0, 126.61729931549468], [2898.0, 141.00799695354155], [2962.0, 114.95406360424026], [3058.0, 202.22885572139293], [2994.0, 114.0441426146011], [3010.0, 129.56815533980574], [3026.0, 188.74770642201835], [3170.0, 103.56437389770736], [3106.0, 142.5827338129496], [3122.0, 161.1782682512735], [3154.0, 222.2142857142857], [3186.0, 82.15573770491804], [3202.0, 137.70049099836322], [3234.0, 162.39656269891802], [3266.0, 235.0], [3314.0, 167.09538950715415], [3282.0, 145.44981751824818], [3298.0, 164.1621725731892], [3218.0, 212.0], [3330.0, 189.41351888668004], [3346.0, 142.56289308176113], [3362.0, 159.6828685258963], [3378.0, 180.64798206278024], [3394.0, 158.62056875730426], [3410.0, 165.09087408548325], [3426.0, 174.0802805923621], [3442.0, 191.92027027027027], [3458.0, 186.86590038314174], [3474.0, 229.6876984126984], [3490.0, 164.87444739168927], [3506.0, 239.9970023980815], [3522.0, 144.34586466165436], [3538.0, 103.68075333027095], [3554.0, 165.32463545663845], [3570.0, 115.23980903415351], [3586.0, 207.15311004784687], [3602.0, 285.68586387434567], [3618.0, 293.8685185185182], [3634.0, 165.89318453567165], [3650.0, 100.61806069578076], [3666.0, 94.27838966957839], [3698.0, 256.0], [3730.0, 172.25322580645158], [3746.0, 102.22246696035253], [3762.0, 101.28621291448508], [3810.0, 231.29290972491282], [3794.0, 401.0], [3714.0, 428.0], [3842.0, 137.30508474576234], [3858.0, 175.54716981132077], [3874.0, 173.4601769911504], [3890.0, 107.9404192717911], [3906.0, 131.1796982167351], [3922.0, 165.70577281191802], [3938.0, 172.88212069937953], [3954.0, 138.72171581769447], [3970.0, 304.8720626631857], [3986.0, 181.47170573969288], [4002.0, 88.24438202247202], [4018.0, 328.83950617283955], [4034.0, 236.0835654596101], [4050.0, 189.62118283726346], [4082.0, 396.0], [4100.0, 215.40879478827364], [4132.0, 278.16586921850103], [4164.0, 232.03867403314905], [4228.0, 219.23586429725367], [4324.0, 208.3027114528527], [4292.0, 391.0], [4452.0, 250.0], [4484.0, 209.9574678536102], [4516.0, 161.07726819541355], [4580.0, 225.66666666666666], [4548.0, 226.0], [4388.0, 385.0], [4612.0, 316.2371364653241], [4644.0, 93.44778761061949], [4676.0, 222.1837794646423], [4708.0, 98.65846599131693], [4740.0, 220.18860312657608], [4772.0, 236.3398251192364], [4804.0, 239.99194847020954], [4836.0, 208.66666666666669], [4868.0, 202.35595286468944], [4900.0, 147.4040194040192], [4932.0, 297.90139335476977], [4964.0, 184.42132796780686], [4996.0, 175.53381066030244], [4101.0, 109.33286418015487], [4133.0, 93.10140562249003], [4165.0, 101.5042682926827], [4197.0, 87.58242990654195], [4229.0, 318.9353796445883], [4261.0, 294.80893617021303], [4293.0, 110.75932203389824], [4325.0, 391.28333333333325], [4357.0, 212.650277557494], [4389.0, 183.50765696784038], [4421.0, 213.15153970826594], [4453.0, 127.52012034599463], [4485.0, 204.7858156028371], [4517.0, 153.37010954616576], [4549.0, 344.7396582733806], [4581.0, 212.88450589670583], [4613.0, 152.30706638115643], [4645.0, 264.08312342569303], [4677.0, 234.05769230769252], [4709.0, 168.9674306393247], [4741.0, 270.84632516703795], [4837.0, 209.0], [4805.0, 210.0], [4869.0, 260.5316354954235], [4901.0, 213.2367194780988], [4933.0, 128.1603927986905], [4965.0, 207.935572042171], [2051.0, 89.64406779661006], [2067.0, 97.32071269487741], [2083.0, 82.65732189973602], [2099.0, 122.71607515657622], [2115.0, 86.22041553748856], [2163.0, 102.05975485188974], [2147.0, 47.826086956521735], [2131.0, 70.78661087866112], [2179.0, 122.58247422680408], [2195.0, 199.25409836065577], [2211.0, 92.95513151108827], [2227.0, 135.03190717911542], [2243.0, 201.0], [2291.0, 77.14915572232648], [2275.0, 105.2429977289933], [2259.0, 111.66579731743668], [2307.0, 188.3195592286502], [2323.0, 135.7228103946102], [2339.0, 79.6122448979592], [2355.0, 101.63185723727706], [2371.0, 104.94548736462086], [2419.0, 99.35319300749212], [2403.0, 102.39625468164785], [2387.0, 129.8343195266273], [2435.0, 92.81086142322096], [2451.0, 76.96808510638294], [2467.0, 120.61002785515306], [2483.0, 66.93080357142864], [2499.0, 67.03378995433789], [2531.0, 105.44811115935744], [2515.0, 103.43119610048754], [2563.0, 122.29727685325247], [2579.0, 108.63064516129035], [2595.0, 91.78112033195023], [2611.0, 125.80207532667201], [2627.0, 125.64275037369194], [2659.0, 135.1197227473219], [2643.0, 193.99489795918353], [2691.0, 105.68954758190328], [2707.0, 124.84202626641623], [2723.0, 128.41577909270214], [2739.0, 102.85906793935983], [2755.0, 107.5668789808917], [2803.0, 206.02777777777777], [2787.0, 123.75422427035333], [2771.0, 106.85705669481302], [2835.0, 135.6142034548944], [2915.0, 110.78447121820618], [2931.0, 113.29999999999993], [2851.0, 158.30103092783526], [2867.0, 177.30997304582223], [2883.0, 164.76923076923077], [2819.0, 368.8571428571429], [2963.0, 143.94472361809076], [3043.0, 133.64328180737195], [2947.0, 149.06743295019166], [2979.0, 149.30050293378034], [2995.0, 215.0], [3011.0, 153.1371801850846], [3027.0, 170.93297345928946], [3059.0, 128.10912863070573], [3075.0, 161.88092485549194], [3091.0, 151.00569476081958], [3107.0, 188.26992481203018], [3123.0, 109.27062706270623], [3155.0, 155.91150442477877], [3187.0, 161.27944969905386], [3203.0, 156.63408304498242], [3219.0, 214.25], [3235.0, 144.24115130299506], [3251.0, 143.5554684437479], [3267.0, 168.43497267759565], [3315.0, 151.71979166666685], [3283.0, 159.27641325536112], [3331.0, 133.59770114942543], [3347.0, 162.12954876273628], [3363.0, 199.2311435523115], [3379.0, 151.89144736842087], [3443.0, 150.0175089534423], [3427.0, 427.0], [3411.0, 209.0], [3395.0, 210.0], [3459.0, 170.20045146726835], [3491.0, 165.91554959785526], [3507.0, 183.17956064947475], [3523.0, 124.30527817403672], [3539.0, 134.18262268704726], [3555.0, 169.4655737704917], [3571.0, 209.3592310772927], [3587.0, 123.7731277533041], [3603.0, 248.7038556193602], [3619.0, 234.84462982273186], [3651.0, 342.33928571428555], [3683.0, 261.2218583708549], [3699.0, 248.01432550736158], [3667.0, 408.0], [3635.0, 412.0], [3715.0, 161.92761394101845], [3731.0, 154.94563008130066], [3763.0, 185.04665314401618], [3779.0, 169.36070853462158], [3795.0, 184.64498432601874], [3827.0, 102.52477134146348], [3859.0, 176.9440868865648], [3875.0, 275.5115479115476], [3907.0, 287.74062499999997], [3923.0, 101.25439127801326], [3939.0, 163.3564493758668], [3987.0, 232.25730994152042], [4019.0, 345.1666666666666], [4035.0, 182.53077279037453], [4051.0, 300.0], [4067.0, 227.55546075085311], [4083.0, 245.48585690515847], [4003.0, 397.0], [4102.0, 229.40468651044947], [4134.0, 179.24015748031482], [4166.0, 227.96134606639356], [4230.0, 86.86152987158019], [4262.0, 174.77132486388388], [4294.0, 427.28000000000003], [4326.0, 168.9938626774071], [4198.0, 394.0], [4358.0, 416.4685314685316], [4454.0, 219.64545818327346], [4486.0, 233.19227674979894], [4518.0, 23.88071716062933], [4550.0, 722.1486486486489], [4422.0, 383.40000000000003], [4390.0, 385.5], [4614.0, 104.88034188034187], [4678.0, 125.62430939226515], [4710.0, 267.61592505854804], [4742.0, 174.69992498124515], [4774.0, 192.87348691917242], [4806.0, 239.15559246954533], [4838.0, 201.57377722975755], [4646.0, 224.0], [4902.0, 262.9662037037039], [4934.0, 265.66169617893746], [4998.0, 251.87325627740137], [4870.0, 208.33333333333334], [4103.0, 144.61828495161805], [4135.0, 239.06628940986275], [4167.0, 238.29977460555997], [4199.0, 234.5643352909768], [4231.0, 189.50187265917603], [4263.0, 152.0229007633589], [4295.0, 295.6031746031745], [4327.0, 187.10556621880997], [4359.0, 154.64102564102564], [4391.0, 256.12753036437226], [4423.0, 208.87682014954788], [4487.0, 77.68191721132892], [4519.0, 47.35885341074012], [4551.0, 509.2428571428573], [4583.0, 157.02425876010813], [4455.0, 231.0], [4615.0, 205.87104622870987], [4647.0, 152.8263392857146], [4679.0, 211.41628959276002], [4711.0, 227.4649532710283], [4743.0, 207.62434921906242], [4807.0, 141.40209580838334], [4839.0, 208.75], [4775.0, 217.14285714285714], [4871.0, 190.06577344701583], [4903.0, 111.96338028169009], [4935.0, 288.1311881188125], [4967.0, 173.1457770921711], [513.0, 21.71197183098589], [525.0, 18.164665523156135], [517.0, 7.92129629629629], [541.0, 34.0351170568562], [537.0, 39.69658119658121], [529.0, 26.33452914798209], [533.0, 32.454681647940035], [521.0, 22.16289409862568], [545.0, 25.971056439942128], [557.0, 22.75395905755115], [549.0, 26.40697148030783], [573.0, 12.418047882136264], [569.0, 11.699376947040506], [561.0, 9.927245358755645], [565.0, 11.348595848595851], [553.0, 38.63774912075024], [581.0, 14.982046678635534], [589.0, 25.83603066439526], [601.0, 28.9085477941177], [605.0, 88.37333333333335], [593.0, 22.22669697953886], [597.0, 42.47846153846153], [585.0, 28.951773835920186], [609.0, 16.973234886940467], [621.0, 12.720000000000002], [613.0, 14.59811431938712], [637.0, 27.189077368638724], [633.0, 15.745953898970086], [625.0, 24.709634988490645], [629.0, 13.267301905717137], [617.0, 25.83004455760664], [641.0, 26.907135173897434], [645.0, 24.269795772124713], [653.0, 27.429347826087024], [665.0, 12.665872543180475], [669.0, 23.862565445026156], [657.0, 35.07896678966785], [661.0, 26.01898280802297], [649.0, 29.29614825581395], [677.0, 36.0], [673.0, 1.0], [697.0, 29.50638297872338], [701.0, 54.379163108454314], [689.0, 48.68181818181817], [681.0, 62.0], [705.0, 33.02290076335881], [717.0, 16.13245033112583], [729.0, 11.86069651741294], [733.0, 17.481382978723428], [721.0, 68.0], [725.0, 23.609300095877284], [713.0, 28.82098518221867], [737.0, 41.80927536231892], [749.0, 29.22182211019085], [741.0, 16.449664429530205], [765.0, 17.245799626633502], [761.0, 63.69788519637454], [753.0, 33.10639880952376], [757.0, 37.42762063227963], [745.0, 38.11173814898421], [773.0, 30.536131386861367], [769.0, 30.36347326874768], [797.0, 35.0870083432658], [793.0, 27.600523560209467], [785.0, 30.80306267806265], [789.0, 15.931673052362699], [777.0, 29.819126819126776], [781.0, 35.27172717271734], [801.0, 26.414746543778797], [813.0, 65.1548480463098], [805.0, 29.675272518646064], [829.0, 18.887323943661972], [825.0, 32.064781675017905], [817.0, 29.554626865671683], [821.0, 34.77945492662472], [809.0, 32.99561563755933], [833.0, 18.333072713057074], [837.0, 56.42833471416725], [861.0, 42.596000000000004], [857.0, 31.801009372746957], [853.0, 34.11446028513234], [841.0, 54.1448275862069], [865.0, 53.3077345035656], [869.0, 15.873744619799144], [877.0, 19.838818565400867], [889.0, 18.57608695652175], [893.0, 41.45849802371538], [881.0, 14.071748878923772], [885.0, 17.21654676258995], [873.0, 16.82591725214675], [897.0, 57.58695652173913], [909.0, 51.85937500000006], [901.0, 47.987517337031925], [925.0, 59.06312292358804], [921.0, 36.33006535947719], [913.0, 51.023206751054836], [917.0, 19.939655172413815], [905.0, 45.761723009814595], [929.0, 29.601936799184504], [941.0, 29.15554231227648], [933.0, 36.34768451519543], [953.0, 39.34313725490196], [957.0, 37.19027954256665], [945.0, 21.817475728155348], [949.0, 31.95765199161426], [937.0, 33.65988909426979], [961.0, 39.99548022598875], [973.0, 53.283916083916104], [965.0, 25.04585152838429], [989.0, 49.4637843907916], [985.0, 1.0], [977.0, 37.67802755620024], [981.0, 61.85897435897435], [969.0, 51.71894517696042], [993.0, 45.35062761506273], [1005.0, 57.22970479704793], [997.0, 42.977234114848734], [1021.0, 53.40439429928753], [1017.0, 38.96911196911198], [1009.0, 38.88817891373804], [1013.0, 39.63955637707951], [1001.0, 39.15398886827451], [1026.0, 46.464566929133966], [1050.0, 42.11563876651987], [1034.0, 53.5420240137221], [1082.0, 41.739311163895486], [1074.0, 42.98573037927159], [1058.0, 37.24988784208157], [1066.0, 44.21802325581396], [1042.0, 43.997265624999955], [1090.0, 57.93094339622639], [1114.0, 21.371237458193985], [1098.0, 47.72444444444444], [1146.0, 51.186915887850496], [1138.0, 31.257950530035345], [1130.0, 53.707661290322555], [1106.0, 39.40295959021071], [1154.0, 31.672038678485098], [1178.0, 48.785150812064984], [1162.0, 42.47372013651879], [1210.0, 22.123867069486394], [1202.0, 17.194690265486706], [1186.0, 56.374172185430474], [1194.0, 49.095084979329194], [1170.0, 48.044390637611], [1218.0, 55.578419071518134], [1242.0, 15.0], [1226.0, 26.846153846153847], [1274.0, 52.96184919210049], [1266.0, 42.85095057034228], [1250.0, 50.154796511627886], [1258.0, 48.0789923142613], [1234.0, 58.75530474040634], [1282.0, 59.404263565891554], [1306.0, 31.660294117647016], [1290.0, 47.02748226950349], [1314.0, 62.35002751788653], [1338.0, 107.34246575342476], [1330.0, 52.26675849403125], [1322.0, 58.927710843373475], [1298.0, 67.22852512155588], [1346.0, 59.83058608058596], [1370.0, 22.260606060606058], [1354.0, 73.29650507328081], [1402.0, 62.94648226097419], [1394.0, 48.11555555555556], [1378.0, 67.30213351686157], [1386.0, 66.5936147186147], [1362.0, 27.29213483146069], [1410.0, 60.72067252579291], [1434.0, 59.623135685704035], [1418.0, 55.681992337164836], [1466.0, 59.406387665198075], [1458.0, 51.421810699588455], [1442.0, 42.86666666666666], [1450.0, 61.04902576995586], [1426.0, 60.494195688225545], [1482.0, 31.06655574043259], [1474.0, 74.76628895184132], [1530.0, 55.64108455882351], [1522.0, 73.4541484716157], [1506.0, 66.80257009345794], [1514.0, 61.62157534246579], [1490.0, 63.34577922077913], [1538.0, 61.369751166407475], [1562.0, 44.87924528301889], [1546.0, 63.35509138381199], [1594.0, 60.49526584122369], [1586.0, 5.4375], [1570.0, 50.676691729323295], [1554.0, 71.76731552738796], [1610.0, 59.35090252707578], [1602.0, 73.78278688524588], [1650.0, 120.11073825503351], [1658.0, 73.45285584768816], [1618.0, 86.27314548591139], [1626.0, 57.869198312236236], [1634.0, 63.51122194513721], [1642.0, 64.53946794592241], [1666.0, 61.901098901098884], [1674.0, 58.72254335260115], [1682.0, 72.747572815534], [1690.0, 69.36277415530526], [1698.0, 73.7919799498746], [1722.0, 97.54032258064511], [1714.0, 39.12068965517242], [1706.0, 118.30541871921184], [1730.0, 81.6179310344828], [1738.0, 80.49912739965097], [1754.0, 109.11783439490436], [1762.0, 58.093949827840625], [1786.0, 60.23650503202193], [1778.0, 101.06973684210521], [1770.0, 62.305003971405846], [1794.0, 69.7899296155928], [1802.0, 85.77419354838709], [1810.0, 114.06451612903224], [1818.0, 75.00549450549448], [1826.0, 28.416666666666664], [1850.0, 73.97595993322199], [1842.0, 81.14141414141417], [1834.0, 80.50286123032895], [1858.0, 101.3505039193729], [1866.0, 80.08435525826839], [1874.0, 70.18208333333347], [1882.0, 78.129880170081], [1890.0, 154.6783625730993], [1914.0, 68.1470509022354], [1906.0, 127.67150635208705], [1898.0, 90.59362549800804], [1922.0, 77.36464909023387], [1930.0, 77.70598977355735], [1938.0, 96.88549019607836], [1946.0, 77.29808627959768], [1954.0, 82.76107899807319], [1978.0, 73.086410354016], [1970.0, 73.4453968253969], [1962.0, 77.23855421686744], [2034.0, 23.886486486486483], [1986.0, 110.79415347137626], [2042.0, 85.0515117581188], [2002.0, 83.30738993710695], [2010.0, 101.21897810218977], [2018.0, 86.82009100455], [2026.0, 71.14316148274408], [2052.0, 86.63479359730418], [2068.0, 82.31464174454851], [2084.0, 84.0678271308522], [2116.0, 40.285714285714285], [2164.0, 66.03462157809986], [2148.0, 86.16545758928584], [2132.0, 85.99580932425357], [2180.0, 6.0], [2196.0, 98.79943729903555], [2212.0, 81.69177126917718], [2228.0, 90.39324116743468], [2244.0, 110.6684841875681], [2292.0, 126.86375545851527], [2260.0, 210.0], [2308.0, 90.87251761691229], [2324.0, 80.71488120050017], [2340.0, 98.80573951434864], [2356.0, 82.64888123924273], [2372.0, 96.7467532467533], [2420.0, 135.6774193548387], [2404.0, 118.62190812720846], [2388.0, 94.8679734793889], [2436.0, 199.3383233532934], [2452.0, 108.78766189502382], [2468.0, 78.47127856701663], [2484.0, 110.60675211003418], [2500.0, 114.4440383736866], [2548.0, 117.26836813611766], [2532.0, 52.89818417639423], [2516.0, 96.67379221889689], [2660.0, 88.38938053097351], [2580.0, 236.0], [2596.0, 167.87573385518604], [2644.0, 110.85871647509572], [2708.0, 145.26644067796633], [2804.0, 125.95024630541872], [2740.0, 126.39690915944192], [2772.0, 144.84216216216268], [2820.0, 131.49938549774714], [2916.0, 324.4285714285714], [2852.0, 100.32953020134242], [2868.0, 120.52345013477107], [2884.0, 105.55206698063851], [2932.0, 354.0], [2900.0, 412.4285714285714], [2836.0, 368.6666666666667], [3044.0, 155.20889101338443], [2964.0, 198.0], [3060.0, 176.50698602794412], [2980.0, 124.65693430656931], [2996.0, 121.309218203034], [3012.0, 137.684485006519], [3028.0, 170.321579689704], [3172.0, 139.32108687332573], [3108.0, 120.51732673267331], [3124.0, 157.16141562365155], [3140.0, 166.64255153636705], [3188.0, 125.68592057761732], [3156.0, 212.0], [3204.0, 132.5705128205128], [3220.0, 143.15420379697784], [3268.0, 128.04599211563732], [3316.0, 148.0023828435266], [3300.0, 142.19772012578613], [3332.0, 147.7717434081069], [3348.0, 152.99628942486092], [3364.0, 152.43113772455106], [3380.0, 155.78164435946445], [3396.0, 153.953025477707], [3412.0, 151.0262951334379], [3428.0, 121.06446540880508], [3444.0, 141.95953141640024], [3476.0, 142.07044470680853], [3492.0, 167.65548607163126], [3508.0, 161.6301652892564], [3524.0, 134.03939393939407], [3540.0, 192.43380855397137], [3556.0, 148.58616187989549], [3572.0, 167.5], [3460.0, 411.0], [3604.0, 195.81989708404816], [3620.0, 166.39143426294808], [3636.0, 159.00624739691776], [3652.0, 301.18798151001545], [3668.0, 257.15789473684174], [3684.0, 158.5562372188139], [3716.0, 118.51756007393698], [3732.0, 166.25697329376843], [3748.0, 246.70918367346883], [3764.0, 305.5912408759125], [3780.0, 292.19047619047615], [3796.0, 127.05013927576606], [3812.0, 427.0], [3828.0, 295.48329156223866], [3844.0, 224.71065182829912], [3876.0, 172.4492753623188], [3892.0, 244.17166212534005], [3908.0, 236.97850617947358], [3924.0, 287.1103723404252], [3940.0, 230.93696275071636], [3956.0, 258.9281487743037], [3972.0, 186.2607802874748], [3988.0, 213.34939759036178], [4004.0, 253.2639007698892], [4020.0, 245.6334841628959], [4068.0, 170.02953586497887], [4084.0, 308.5], [4052.0, 397.8], [4104.0, 142.4501510574019], [4136.0, 380.4028892455863], [4168.0, 98.15021929824559], [4200.0, 227.7940740740742], [4232.0, 226.93116328708635], [4296.0, 247.50846681922224], [4328.0, 289.05297532656], [4264.0, 390.55555555555554], [4360.0, 194.19512195121948], [4424.0, 168.503205128205], [4488.0, 96.04500978473585], [4520.0, 238.5], [4552.0, 167.89815178922532], [4392.0, 385.75], [4648.0, 146.82673267326734], [4680.0, 283.16666666666686], [4712.0, 206.5], [4776.0, 286.7191176470588], [4840.0, 203.54300871542245], [4744.0, 218.33333333333334], [4872.0, 314.236147757256], [4904.0, 192.6927062574732], [4936.0, 113.35897435897436], [5000.0, 215.5326542404976], [4105.0, 265.5548098434006], [4137.0, 99.06301905227158], [4169.0, 258.1711491442545], [4201.0, 164.94924242424267], [4233.0, 198.20013614703888], [4265.0, 128.54880774962703], [4297.0, 156.825726141079], [4329.0, 164.1273432449902], [4361.0, 248.02543103448295], [4393.0, 136.4592030360533], [4425.0, 184.42083333333326], [4457.0, 197.9877253548139], [4489.0, 236.36114469971787], [4521.0, 75.3438300988648], [4553.0, 240.49257530759462], [4585.0, 236.9410309278348], [4617.0, 227.784496124031], [4649.0, 244.6047313947761], [4681.0, 163.8761401824288], [4713.0, 224.70823045267514], [4745.0, 237.85874613002989], [4777.0, 140.5436573311365], [4841.0, 214.57398373983725], [4873.0, 153.2684824902722], [4969.0, 271.0384459732904], [4905.0, 207.0], [2053.0, 79.77635327635326], [2069.0, 91.54744525547433], [2085.0, 122.04761904761908], [2101.0, 83.40523776705726], [2117.0, 63.21899736147746], [2165.0, 129.59449192782526], [2149.0, 79.27304048234286], [2133.0, 80.36093807255398], [2181.0, 85.87865947611724], [2197.0, 94.72564935064929], [2213.0, 97.28381865093988], [2229.0, 117.03407477520109], [2245.0, 90.29994209612039], [2293.0, 94.25038167938919], [2277.0, 111.40863999999976], [2261.0, 98.96532012195105], [2309.0, 115.02775119617228], [2325.0, 137.34162895927594], [2341.0, 71.38688524590182], [2357.0, 59.60377358490566], [2373.0, 152.59040590405888], [2421.0, 74.0462499999999], [2405.0, 77.47072784810135], [2389.0, 69.01338432122365], [2437.0, 90.75226757369623], [2453.0, 79.67420435510894], [2469.0, 122.56393744250246], [2485.0, 86.46203763789741], [2549.0, 120.67085661080087], [2533.0, 163.74973262032063], [2517.0, 100.64142447810087], [2565.0, 111.34950720242597], [2581.0, 123.5627466456198], [2597.0, 97.78619839802846], [2613.0, 136.04910366328917], [2629.0, 208.4427480916031], [2661.0, 121.29415715245149], [2677.0, 138.04258498319038], [2693.0, 116.93371868978802], [2709.0, 97.98303647158609], [2741.0, 179.01492537313405], [2757.0, 132.60736677116003], [2789.0, 226.1451612903224], [2805.0, 217.84137931034473], [2773.0, 105.37146371463726], [2821.0, 103.97607655502387], [2837.0, 124.90783410138242], [2853.0, 137.13886792452806], [2869.0, 151.88503401360535], [2901.0, 131.65962441314525], [2917.0, 129.48451242829805], [2933.0, 121.77383766745454], [3045.0, 108.77439024390246], [2949.0, 138.43606431852976], [2965.0, 124.56841686555275], [3061.0, 154.8145454545454], [3013.0, 165.7443841982957], [3029.0, 102.5577085088459], [3077.0, 161.8591954022989], [3093.0, 132.379601226994], [3125.0, 128.09032258064522], [3109.0, 214.0], [3141.0, 192.6356589147285], [3189.0, 157.27277936962756], [3173.0, 180.27440147329662], [3157.0, 154.57979953739442], [3205.0, 149.59483178937091], [3221.0, 157.56463675213706], [3237.0, 175.13771517996867], [3253.0, 181.87067804220956], [3269.0, 158.39934853420206], [3301.0, 180.56637168141594], [3317.0, 211.0], [3349.0, 189.2606232294617], [3381.0, 211.54729729729738], [3397.0, 116.0], [3429.0, 140.9351327818891], [3413.0, 208.33333333333334], [3461.0, 157.61623325453124], [3493.0, 159.2768878718537], [3509.0, 167.0441767068273], [3525.0, 82.22574257425758], [3541.0, 205.67396593673953], [3557.0, 163.81754385964894], [3573.0, 169.5960290187093], [3477.0, 411.625], [3589.0, 245.76493866244476], [3605.0, 153.43542857142842], [3621.0, 159.18215845290078], [3637.0, 151.87704918032793], [3653.0, 200.51720647773277], [3669.0, 92.50204233197174], [3685.0, 148.9825610363729], [3701.0, 178.23777064955877], [3717.0, 76.83445491251693], [3733.0, 159.8189655172413], [3749.0, 344.0], [3765.0, 85.6154533273784], [3781.0, 180.83693155718882], [3797.0, 129.20732931726897], [3813.0, 118.50187265917589], [3845.0, 95.24349775784738], [3861.0, 329.9291338582677], [3877.0, 143.2923005993548], [3909.0, 177.43185419968273], [3925.0, 239.34410646387852], [3941.0, 199.30039011703482], [3957.0, 342.0], [3893.0, 401.1666666666667], [3973.0, 375.85714285714283], [4005.0, 201.44891122278025], [4021.0, 221.22941176470584], [4037.0, 172.43321718931458], [4053.0, 177.07256499805962], [4069.0, 206.779283639884], [4085.0, 184.36898395721929], [4106.0, 271.5312306740872], [4138.0, 235.99327797548455], [4170.0, 257.1960526315794], [4234.0, 97.36803874092018], [4266.0, 290.5905032467519], [4330.0, 99.13718070009448], [4298.0, 388.0], [4202.0, 394.0], [4362.0, 256.3736089030201], [4394.0, 156.91445783132542], [4426.0, 208.30697312037424], [4458.0, 258.4853433835845], [4490.0, 169.17059483726135], [4522.0, 111.58926574729799], [4554.0, 263.65979381443344], [4586.0, 290.3400503778335], [4618.0, 257.5035460992905], [4650.0, 420.56054931335814], [4682.0, 112.70032573289896], [4714.0, 371.8655256723718], [4778.0, 174.46611281154338], [4810.0, 283.9733492442321], [4842.0, 209.0], [4874.0, 134.2007684918346], [4906.0, 386.8217317487271], [4938.0, 188.72111065741115], [4970.0, 170.54827280779483], [4107.0, 217.33333333333334], [4171.0, 176.4169278996867], [4203.0, 234.74035669846515], [4235.0, 257.1482611348381], [4299.0, 252.28752886836008], [4331.0, 242.74571805006605], [4267.0, 390.5], [4139.0, 395.0], [4363.0, 89.02413273001504], [4395.0, 249.27108433734966], [4427.0, 150.09972041006554], [4459.0, 414.0], [4491.0, 174.0], [4523.0, 140.39497041420063], [4555.0, 111.30677052127037], [4587.0, 88.91176470588232], [4619.0, 329.65384615384613], [4651.0, 105.911617565314], [4747.0, 214.73826051449578], [4779.0, 302.23687943262456], [4811.0, 201.15359926639198], [4843.0, 214.61487795428215], [4875.0, 248.69585253456202], [4907.0, 136.83849557522103], [4939.0, 306.20736698499246], [4971.0, 251.4615384615384], [1027.0, 42.33791208791197], [1051.0, 63.327272727272735], [1035.0, 30.57020435069214], [1083.0, 52.76945244956771], [1075.0, 69.01376146788994], [1059.0, 80.08908045977019], [1043.0, 23.943820224719108], [1091.0, 54.593696763202736], [1115.0, 54.973023255814], [1099.0, 51.504873294346964], [1139.0, 51.729234527687254], [1147.0, 41.30872056015281], [1123.0, 50.11193202807537], [1131.0, 48.01913662661324], [1107.0, 44.12468193384226], [1155.0, 67.08236101578588], [1179.0, 50.946932006633425], [1163.0, 55.59353830119859], [1211.0, 49.351262349066914], [1203.0, 49.85229392017906], [1187.0, 48.153909465020746], [1195.0, 57.526613816534635], [1171.0, 42.55904961565337], [1219.0, 50.29019292604509], [1243.0, 31.21221221221221], [1227.0, 57.57239742285521], [1275.0, 56.662911221270925], [1267.0, 66.3790322580645], [1251.0, 51.87405541561714], [1259.0, 59.14822134387348], [1235.0, 25.039138943248528], [1283.0, 55.20145985401464], [1307.0, 58.88136227544915], [1291.0, 53.21175523349447], [1331.0, 59.754716981132006], [1339.0, 27.251162790697677], [1315.0, 33.865528281750265], [1323.0, 50.912442396313416], [1299.0, 48.932388222464546], [1347.0, 70.28571428571429], [1371.0, 53.09153005464474], [1355.0, 43.52005065428448], [1403.0, 50.42010652463378], [1395.0, 57.173267326732635], [1379.0, 27.855018587360632], [1387.0, 22.93360160965795], [1363.0, 61.83883495145646], [1411.0, 64.29299363057326], [1435.0, 24.90371991247267], [1419.0, 55.97409326424874], [1467.0, 1.9846153846153847], [1459.0, 60.12662337662334], [1443.0, 68.96587807097359], [1451.0, 41.31604938271603], [1427.0, 66.64705882352939], [1475.0, 36.822988505747134], [1499.0, 63.00184026499822], [1483.0, 61.56376094404256], [1531.0, 66.9370860927151], [1523.0, 60.659379968203524], [1507.0, 22.028268551236746], [1515.0, 62.272613065326595], [1491.0, 60.343243243243236], [1595.0, 69.0], [1587.0, 76.60670844084062], [1571.0, 69.0462218649517], [1579.0, 64.46079524340398], [1555.0, 2.6], [1563.0, 60.70162481536192], [1611.0, 82.06263982102912], [1603.0, 59.02011494252874], [1651.0, 67.36199095022621], [1659.0, 71.55785627283824], [1619.0, 67.88717948717947], [1627.0, 69.1437448218723], [1635.0, 72.81901279707486], [1667.0, 74.52956989247306], [1675.0, 70.1375186846039], [1683.0, 69.54912866147555], [1691.0, 78.25786713286712], [1699.0, 73.87325174825177], [1723.0, 36.815789473684205], [1715.0, 55.75605214152697], [1707.0, 136.20000000000002], [1731.0, 91.11164581328197], [1739.0, 58.512950450450504], [1747.0, 71.3333333333333], [1755.0, 69.36225087924959], [1763.0, 71.5668586052464], [1787.0, 113.34913112164298], [1779.0, 49.46596858638743], [1771.0, 116.63846153846151], [1795.0, 77.8689655172413], [1803.0, 80.27800829875513], [1811.0, 76.54016477857874], [1819.0, 71.86421052631582], [1827.0, 39.83333333333336], [1851.0, 90.47560975609757], [1843.0, 53.35140186915881], [1859.0, 56.38839285714289], [1867.0, 70.0], [1875.0, 124.11111111111111], [1891.0, 12.375], [1915.0, 68.75247524752467], [1907.0, 51.762298307752815], [1923.0, 123.88888888888889], [1931.0, 119.85714285714286], [1939.0, 75.90397750100445], [1947.0, 90.8555910543131], [1955.0, 76.53732446415378], [1979.0, 74.5091911764705], [1971.0, 91.81589041095901], [1963.0, 57.79988399071926], [1987.0, 82.84301161393672], [1995.0, 67.51221374045794], [2003.0, 68.82386634844863], [2011.0, 83.63439849624072], [2019.0, 84.21394230769243], [2043.0, 94.99750312109869], [2035.0, 95.0], [2027.0, 86.0332647462277], [2054.0, 88.06292045904236], [2070.0, 88.03343782654123], [2086.0, 89.23841961852862], [2102.0, 86.45330535152146], [2118.0, 100.0590046177528], [2166.0, 73.92038216560515], [2150.0, 131.84748010610085], [2134.0, 85.3612836438925], [2198.0, 107.66839378238342], [2182.0, 26.065359477124183], [2278.0, 92.43785310734472], [2294.0, 210.08627450980384], [2230.0, 92.93810444874266], [2246.0, 113.24477806788519], [2262.0, 197.95833333333314], [2406.0, 178.67263427109975], [2326.0, 79.71182266009846], [2422.0, 143.20192307692278], [2342.0, 96.5395705521473], [2358.0, 101.11056401074335], [2374.0, 61.67140600315956], [2390.0, 115.75061425061428], [2438.0, 14.473903966597069], [2454.0, 43.31807228915668], [2470.0, 11.0], [2486.0, 136.11777535441632], [2502.0, 104.3927813163483], [2550.0, 106.29621380846324], [2534.0, 83.19641401793002], [2518.0, 128.9229857819904], [2662.0, 129.2171968190857], [2678.0, 106.96732788798118], [2598.0, 169.4293628808866], [2614.0, 194.26000000000005], [2630.0, 116.65175718849848], [2646.0, 115.18859429714858], [2790.0, 121.76903023983299], [2694.0, 144.63033175355486], [2806.0, 131.04078164825842], [2726.0, 127.83216237314613], [2742.0, 222.44444444444446], [2758.0, 134.0418766963937], [2774.0, 148.8137178487918], [2822.0, 133.50779603877], [2838.0, 290.0], [2918.0, 154.11045029736604], [2934.0, 207.18661347517707], [2870.0, 126.27381974248932], [2886.0, 169.22675026123272], [2902.0, 360.66666666666674], [2854.0, 366.0], [2966.0, 196.5430463576159], [3062.0, 153.26558157999256], [2982.0, 136.66409861325127], [2998.0, 147.72870905587652], [3014.0, 97.77173913043471], [3030.0, 174.6684250188397], [3046.0, 214.0], [3174.0, 123.09759358288782], [3078.0, 119.19597169297771], [3094.0, 214.14285714285714], [3190.0, 107.66035353535351], [3110.0, 162.6342967244701], [3126.0, 225.8580246913579], [3142.0, 143.62433862433858], [3158.0, 185.75], [3206.0, 107.96106194690262], [3222.0, 117.9095966620305], [3238.0, 133.08060836501895], [3254.0, 139.51764705882357], [3270.0, 143.2251407129456], [3318.0, 155.7450514647665], [3302.0, 166.03532608695656], [3286.0, 166.0143633540373], [3334.0, 166.09373799462142], [3350.0, 142.88504983388728], [3366.0, 161.3592156862747], [3382.0, 156.1036734693875], [3398.0, 162.86287495130466], [3414.0, 159.5316213108469], [3430.0, 191.0993733213966], [3446.0, 157.11042231693168], [3462.0, 197.69583819525457], [3478.0, 159.74280230326286], [3494.0, 156.09753160746544], [3510.0, 155.33787731256103], [3542.0, 153.3793103448277], [3558.0, 163.9296460176993], [3574.0, 409.3333333333333], [3606.0, 174.4724358974357], [3622.0, 187.72040946897002], [3638.0, 161.95915221579935], [3654.0, 167.7968561064086], [3670.0, 371.0], [3702.0, 176.4815422477442], [3686.0, 406.2857142857143], [3718.0, 185.53047404063207], [3734.0, 130.9828486204324], [3750.0, 105.86750555144368], [3766.0, 90.60634920634915], [3782.0, 144.93833780160864], [3798.0, 275.6697108066968], [3814.0, 245.73883021933383], [3830.0, 165.82362204724373], [3846.0, 107.62373737373744], [3862.0, 84.1571263926238], [3878.0, 105.51139137510157], [3894.0, 110.38811188811187], [3910.0, 179.93432369038314], [3926.0, 225.5895161290324], [3942.0, 200.57790368271944], [3958.0, 183.25612203934156], [3974.0, 191.44160866202634], [3990.0, 193.77985377741692], [4006.0, 103.10049019607837], [4022.0, 106.97523961661332], [4038.0, 146.91894630192525], [4070.0, 144.0738396624474], [4086.0, 395.6666666666667], [4108.0, 178.62010288880123], [4172.0, 227.4285714285714], [4236.0, 250.36976744186066], [4268.0, 234.5], [4300.0, 241.78387309980158], [4332.0, 349.98026315789446], [4140.0, 395.0], [4364.0, 250.83305369127535], [4396.0, 298.1166936790921], [4428.0, 191.2608695652177], [4492.0, 192.5], [4588.0, 115.0947368421052], [4556.0, 226.5], [4460.0, 231.0], [4620.0, 271.1019055509529], [4684.0, 284.98261589403955], [4716.0, 162.8273542600897], [4780.0, 168.78664731494908], [4812.0, 259.77260273972615], [4844.0, 197.0], [4652.0, 223.0], [4876.0, 253.24515618821582], [4908.0, 146.94000000000023], [4940.0, 96.95089707271016], [4141.0, 112.21844660194186], [4173.0, 142.55266497461892], [4205.0, 129.56714719271628], [4237.0, 145.42586490939055], [4269.0, 198.85186595582647], [4301.0, 160.9480762047068], [4333.0, 175.83299798792711], [4365.0, 261.0144727773949], [4397.0, 105.50821667681078], [4429.0, 267.7719101123593], [4461.0, 128.39969947407977], [4493.0, 261.197699190456], [4525.0, 177.5439849624065], [4557.0, 202.22010539116403], [4589.0, 268.92248656945463], [4621.0, 121.03969171483645], [4653.0, 311.4954486345907], [4685.0, 160.98586572438168], [4717.0, 246.3315441783648], [4749.0, 306.5332749562169], [4813.0, 414.4592592592593], [4845.0, 222.33846761453376], [4781.0, 217.6], [4909.0, 273.8111979166662], [4941.0, 186.82411460405936], [4973.0, 284.84306569343056], [2055.0, 83.12391930835746], [2071.0, 83.95629820051413], [2087.0, 89.70443349753701], [2103.0, 84.9407083167527], [2119.0, 88.70885149963418], [2167.0, 19.10762331838564], [2151.0, 81.61919611919615], [2135.0, 91.78411214953263], [2183.0, 97.64570552147258], [2199.0, 107.55952380952391], [2215.0, 207.0], [2231.0, 116.50000000000003], [2247.0, 84.08653846153847], [2295.0, 101.25638116846274], [2279.0, 97.55162523900565], [2263.0, 104.28980249899243], [2311.0, 99.2762214983716], [2327.0, 138.10317460317464], [2343.0, 95.68555008210193], [2359.0, 101.09005186232885], [2375.0, 109.88872028325747], [2423.0, 80.5588499550764], [2407.0, 99.9680628272252], [2391.0, 74.06223175965658], [2439.0, 86.99879735417917], [2455.0, 73.18270270270273], [2471.0, 99.31728395061732], [2487.0, 173.54545454545453], [2503.0, 96.92453531598517], [2551.0, 212.0285714285714], [2535.0, 66.81664726426075], [2519.0, 61.543859649122815], [2583.0, 111.75932469572044], [2567.0, 118.11036288814063], [2663.0, 164.88556338028184], [2599.0, 111.7051338306273], [2615.0, 107.73310374515711], [2647.0, 128.15914585012126], [2695.0, 104.87268232385652], [2711.0, 175.10201660735484], [2727.0, 158.24225352112677], [2743.0, 121.52973513243363], [2791.0, 125.84341782502027], [2775.0, 105.89617083946985], [2807.0, 371.16666666666663], [2839.0, 137.4641333850332], [2823.0, 103.18454935622314], [2919.0, 135.44002695417802], [2935.0, 102.80400890868592], [2855.0, 137.39303294206726], [2871.0, 458.5], [2887.0, 101.2238805970149], [2903.0, 130.62852664576764], [2951.0, 135.42598303777967], [2967.0, 145.3922855970459], [2999.0, 141.9871355060035], [3015.0, 214.33333333333334], [3063.0, 130.3534482758621], [3047.0, 135.56105221829645], [3031.0, 100.29138062547663], [3079.0, 165.9508758568167], [3095.0, 143.8172124904799], [3127.0, 138.61283376399678], [3143.0, 155.15720524017465], [3175.0, 146.7877412031784], [3159.0, 168.49790635706134], [3111.0, 214.0], [3207.0, 145.53998447205], [3223.0, 141.36727416798766], [3239.0, 157.66987319632688], [3255.0, 167.0], [3319.0, 211.2], [3303.0, 211.71428571428572], [3335.0, 198.4743729552889], [3383.0, 359.0], [3415.0, 162.06223628691984], [3463.0, 158.07272727272724], [3495.0, 99.11048158640226], [3511.0, 172.06885998469744], [3527.0, 255.236959158917], [3543.0, 188.01640135069937], [3559.0, 169.87340696686508], [3575.0, 152.1704035874437], [3591.0, 160.1933099961107], [3607.0, 169.53838582677162], [3623.0, 122.01245210727959], [3671.0, 235.06833558863346], [3687.0, 213.12666666666667], [3703.0, 193.17857142857144], [3639.0, 410.0], [3719.0, 248.44685138539046], [3735.0, 287.0], [3751.0, 329.6320754716982], [3767.0, 222.57383966244754], [3783.0, 80.98005908419489], [3799.0, 136.23793103448278], [3815.0, 347.75], [3831.0, 309.0], [3863.0, 335.95558086560385], [3879.0, 46.552727272727296], [3895.0, 78.10489913544674], [3927.0, 93.70414847161594], [3943.0, 162.9665137614679], [3959.0, 281.5], [3911.0, 401.5714285714286], [3847.0, 400.8888888888889], [3991.0, 241.10655737704914], [4023.0, 256.0356119525173], [4039.0, 104.38272345530879], [4055.0, 180.09509083880903], [4071.0, 208.15516463689696], [4087.0, 110.89444237224937], [3975.0, 398.0], [4110.0, 94.86311349693266], [4142.0, 240.45059288537504], [4174.0, 89.95571428571427], [4238.0, 90.29147982062779], [4270.0, 108.21824480369534], [4334.0, 111.128], [4302.0, 388.0], [4206.0, 393.0], [4366.0, 141.88964346349735], [4398.0, 246.16138763197569], [4430.0, 196.88258014677513], [4462.0, 263.71543732366024], [4494.0, 175.95765230312097], [4526.0, 230.28116213683194], [4558.0, 208.02141203703704], [4590.0, 168.31902381652472], [4622.0, 20.0], [4654.0, 98.79934210526325], [4718.0, 304.39698492462315], [4750.0, 92.84295302013406], [4782.0, 162.83386709367423], [4814.0, 195.60806317539488], [4846.0, 350.7694369973192], [4878.0, 173.20775623268693], [4910.0, 155.81624605678238], [4974.0, 168.13638203156626], [4942.0, 206.0], [4111.0, 295.50573770491764], [4175.0, 123.13938411669376], [4207.0, 254.16544117647024], [4271.0, 169.44444444444446], [4303.0, 300.0714862681747], [4335.0, 277.1765447667093], [4239.0, 392.7], [4143.0, 395.5], [4367.0, 168.67647058823533], [4399.0, 183.76344537815106], [4431.0, 192.93624161073834], [4463.0, 359.0], [4527.0, 97.32028884230155], [4559.0, 79.78031088082896], [4591.0, 82.75191815856778], [4495.0, 228.125], [4623.0, 248.23607748183983], [4655.0, 90.8861434108528], [4687.0, 240.7921161825726], [4719.0, 91.76668707899593], [4751.0, 240.17132138391], [4783.0, 249.83410493827137], [4815.0, 206.0], [4847.0, 210.6904221516116], [4911.0, 207.20260964117423], [4943.0, 241.5655416012557], [4975.0, 420.95555555555546], [4879.0, 208.0], [257.0, 4.7391304347826075], [259.0, 46.560928433268835], [261.0, 10.339355295784596], [263.0, 5.352474323062558], [265.0, 10.649733570159869], [271.0, 6.624858757062158], [269.0, 10.410396219556514], [267.0, 5.281873373807461], [273.0, 13.126529051987823], [275.0, 9.043053545586078], [277.0, 16.28102010789604], [279.0, 12.64742056713359], [287.0, 59.0], [285.0, 6.126162018592292], [281.0, 5.830244313395111], [283.0, 62.0], [289.0, 6.077519379844954], [291.0, 7.220238095238101], [293.0, 72.83418367346944], [295.0, 21.319148936170247], [303.0, 11.45514845230574], [301.0, 63.0], [297.0, 7.700777202072536], [305.0, 20.91391794046661], [307.0, 58.0], [311.0, 1.1159420289855075], [319.0, 39.577777777777776], [317.0, 16.177028451001053], [313.0, 58.5], [315.0, 56.0], [321.0, 13.145396373977949], [323.0, 32.122186495176884], [325.0, 58.0], [327.0, 24.58597502401539], [335.0, 13.527589889640408], [333.0, 13.605889471561081], [329.0, 56.00000000000001], [331.0, 14.550220480156803], [337.0, 9.190366088631958], [339.0, 13.861329521086509], [341.0, 20.358802502234205], [343.0, 13.752588361299514], [351.0, 20.050614605929127], [349.0, 29.41843088418438], [345.0, 68.36029411764706], [347.0, 48.13617021276595], [353.0, 6.7820343461030355], [355.0, 14.094661921708147], [357.0, 7.005516154452315], [359.0, 17.35485047410647], [367.0, 7.259936043855632], [365.0, 14.031316725978648], [361.0, 7.060818083961241], [363.0, 17.194843462246848], [369.0, 16.345260223048335], [371.0, 15.262128325508561], [373.0, 16.10143097643098], [375.0, 65.89052631578947], [383.0, 7.690235690235699], [377.0, 15.379798732761817], [379.0, 36.39468690702083], [397.0, 22.959600760456315], [385.0, 9.006339144215522], [399.0, 22.928756476683958], [389.0, 8.860493827160495], [391.0, 8.688861985472153], [393.0, 8.491094147582697], [395.0, 43.63481228668939], [401.0, 17.178147268408555], [403.0, 16.538461538461533], [405.0, 16.087829854273327], [407.0, 40.20647149460708], [415.0, 15.617028856430334], [413.0, 19.062386156648454], [409.0, 24.68256772673732], [411.0, 15.370707488622225], [419.0, 33.203243243243264], [417.0, 48.260450160771654], [429.0, 8.874828060522702], [431.0, 17.65386154461787], [421.0, 9.10599078341015], [423.0, 7.972027972027972], [425.0, 9.996350364963495], [427.0, 19.05740072202165], [433.0, 17.63238434163696], [435.0, 12.354032833690212], [437.0, 9.296352583586641], [447.0, 89.46587537091995], [445.0, 9.7116499736426], [441.0, 32.597142857142856], [443.0, 7.93161764705882], [451.0, 45.380246913580244], [449.0, 8.358024691358025], [463.0, 22.891566265060288], [461.0, 50.69888475836431], [457.0, 20.84629133154601], [459.0, 9.553971486761705], [465.0, 45.39242685025825], [467.0, 8.50892857142857], [469.0, 12.568288854003148], [479.0, 19.60324543610551], [477.0, 49.80645161290323], [473.0, 21.25809393524851], [475.0, 21.02057877813505], [481.0, 19.128745837957805], [483.0, 1.0900900900900907], [485.0, 44.236666666666686], [487.0, 19.20621872766261], [489.0, 25.794081381011033], [495.0, 24.4245083207261], [493.0, 18.31964285714288], [491.0, 23.778746594005458], [497.0, 26.96173044925124], [499.0, 13.709442060085848], [501.0, 24.770351008215183], [503.0, 11.670284938941661], [511.0, 68.23232323232321], [509.0, 8.326063249727373], [505.0, 10.26670474014848], [507.0, 24.081215744892884], [518.0, 37.15573267933774], [514.0, 15.221052631578946], [526.0, 9.989173228346447], [522.0, 10.053191489361705], [542.0, 19.97119851347167], [538.0, 15.507551240560979], [530.0, 9.226548672566372], [534.0, 9.358573216520664], [550.0, 22.637911025145073], [546.0, 30.685534591194955], [558.0, 25.385982230996994], [554.0, 16.853365384615387], [574.0, 31.092796885139517], [570.0, 28.689477557027235], [562.0, 22.282803003217705], [566.0, 26.135200974421473], [578.0, 24.111524163568824], [582.0, 25.91414868105517], [590.0, 11.942073170731707], [586.0, 12.025894897182031], [602.0, 10.640163098878695], [606.0, 1.0], [594.0, 11.620967741935486], [598.0, 28.978557504873308], [614.0, 33.797175866495486], [610.0, 37.869757174392895], [622.0, 28.14617263843657], [618.0, 22.78441011235958], [638.0, 11.880108991825608], [634.0, 69.6780303030303], [626.0, 48.93828715365237], [630.0, 55.75113808801212], [642.0, 60.38297872340425], [666.0, 57.41129831516353], [670.0, 33.47674418604652], [662.0, 62.56000000000002], [674.0, 34.32203389830506], [686.0, 26.54412811387902], [678.0, 29.101974865350048], [698.0, 28.16195273149942], [702.0, 28.51327102803737], [690.0, 22.341279799247218], [694.0, 27.48164146868248], [682.0, 27.506874095513773], [710.0, 23.141025641025635], [718.0, 33.121739130434776], [714.0, 29.002246349681734], [706.0, 30.483017203352457], [730.0, 29.669902912621367], [734.0, 26.850810810810785], [722.0, 48.18634812286684], [726.0, 47.02935995302412], [742.0, 34.17877866814042], [738.0, 15.42607897153352], [750.0, 67.4], [746.0, 17.598113207547197], [766.0, 15.117117117117118], [762.0, 29.28272564255828], [754.0, 33.75], [758.0, 15.85164835164835], [798.0, 15.650289017341036], [782.0, 76.0], [794.0, 31.223350253807105], [786.0, 45.694805194805184], [790.0, 42.11153601019767], [778.0, 9.950000000000001], [814.0, 34.178271308523406], [802.0, 37.84005340453944], [810.0, 64.97311827956995], [806.0, 37.08571428571427], [830.0, 62.30282738095243], [826.0, 0.8571428571428571], [818.0, 10.664556962025312], [838.0, 21.241042345276856], [834.0, 51.189768976897696], [846.0, 34.77691043549721], [842.0, 31.652500940202994], [862.0, 34.7381141045959], [858.0, 36.4], [850.0, 33.58384643245202], [854.0, 17.449438202247183], [878.0, 48.45539358600581], [866.0, 19.24963503649635], [874.0, 47.05420054200535], [890.0, 64.14583333333336], [894.0, 52.362030905077276], [882.0, 0.9199999999999998], [886.0, 39.62015503875986], [902.0, 33.25911385305656], [898.0, 34.73793103448274], [910.0, 25.683435582822113], [906.0, 18.555555555555557], [926.0, 38.683431952662716], [922.0, 52.06308919506888], [914.0, 29.141832229580512], [918.0, 35.26237263464337], [934.0, 60.5], [942.0, 45.28184642698624], [938.0, 40.02462437395668], [930.0, 50.39234449760762], [954.0, 37.336315575437204], [958.0, 25.623217922606926], [946.0, 44.12734082397002], [950.0, 46.428788454234734], [966.0, 39.18856534090908], [962.0, 19.553223388305863], [974.0, 35.661916461916434], [970.0, 29.982375478927224], [990.0, 19.20880245649949], [986.0, 47.487649402390446], [978.0, 49.7791193181818], [982.0, 33.83677419354835], [998.0, 18.732558139534877], [994.0, 21.375939849624043], [1006.0, 40.97072599531614], [1002.0, 48.66804407713498], [1022.0, 23.19020715630885], [1018.0, 39.50632911392412], [1010.0, 38.00291332847785], [1014.0, 38.247482014388446], [1036.0, 48.511314013497504], [1028.0, 179.8823529411764], [1052.0, 41.40074211502776], [1044.0, 55.98418491484186], [1084.0, 36.08472622478387], [1076.0, 42.94636471990467], [1060.0, 42.14769765421377], [1068.0, 47.040796344647646], [1100.0, 44.071100917431224], [1092.0, 37.43916349809874], [1116.0, 23.735880398671092], [1108.0, 47.15883100381189], [1148.0, 58.88076036866353], [1140.0, 25.151750972762642], [1124.0, 54.16892911010558], [1132.0, 68.21674876847301], [1164.0, 19.57627118644065], [1156.0, 37.159934047815355], [1180.0, 47.39898053753464], [1172.0, 55.52303921568632], [1212.0, 63.72985507246371], [1204.0, 67.36986301369863], [1188.0, 60.83333333333333], [1196.0, 46.91278375149335], [1228.0, 64.02650176678445], [1220.0, 60.78947368421057], [1244.0, 61.87609075043638], [1236.0, 57.126829268292695], [1276.0, 62.16836734693879], [1268.0, 46.36582568807344], [1252.0, 51.71754729288986], [1260.0, 32.528158295281585], [1308.0, 57.5684596577017], [1292.0, 58.998373983739796], [1340.0, 55.2558139534884], [1332.0, 68.7773882559158], [1316.0, 55.33257698541339], [1324.0, 55.474999999999966], [1372.0, 54.2618556701031], [1348.0, 61.77736958119028], [1364.0, 59.728178368121426], [1356.0, 72.73435655253837], [1404.0, 69.28902714932134], [1396.0, 59.0160295930949], [1380.0, 49.71043771043769], [1436.0, 57.79029199848316], [1412.0, 56.680915516661095], [1428.0, 63.213208685162925], [1420.0, 59.052880075542994], [1468.0, 66.05967865340473], [1460.0, 60.47153465346529], [1452.0, 76.98529411764707], [1476.0, 34.07352941176471], [1500.0, 70.0], [1484.0, 52.0434126085315], [1532.0, 54.60000000000001], [1524.0, 69.25692041522494], [1508.0, 62.19587628865981], [1516.0, 50.76248976248976], [1492.0, 56.74173369079536], [1548.0, 66.34128952262823], [1540.0, 73.15668371073788], [1564.0, 83.21469218830819], [1556.0, 58.948700410396675], [1596.0, 64.92911668484187], [1588.0, 2.1403508771929824], [1572.0, 61.0909970958374], [1580.0, 0.8709677419354838], [1604.0, 81.46125461254613], [1620.0, 75.45538958417431], [1612.0, 37.49999999999998], [1660.0, 28.42447916666668], [1652.0, 71.06731352334744], [1636.0, 86.41666666666667], [1644.0, 76.2119622245538], [1668.0, 72.3230500582072], [1676.0, 78.48679245283017], [1684.0, 63.09367245657574], [1692.0, 45.470899470899475], [1724.0, 64.77227722772274], [1716.0, 74.10634107916513], [1700.0, 57.19999999999998], [1708.0, 67.53424657534244], [1732.0, 72.58501937150244], [1740.0, 62.63246554364475], [1748.0, 89.56594724220628], [1788.0, 106.58219178082189], [1780.0, 74.42130750605328], [1764.0, 76.04966139954853], [1772.0, 71.17862318840565], [1796.0, 80.16351558507905], [1804.0, 72.41974077766697], [1812.0, 109.90286975717424], [1820.0, 79.01472172351885], [1852.0, 50.774922118380054], [1844.0, 80.19866071428558], [1828.0, 99.20880913539975], [1836.0, 71.89360172537731], [1860.0, 82.68556361239267], [1868.0, 65.6385993049987], [1876.0, 70.91838995568686], [1884.0, 66.65552497050732], [1916.0, 104.99911268855365], [1908.0, 134.8591859185919], [1892.0, 56.70289855072464], [1900.0, 77.6320125539427], [1924.0, 68.7231092436975], [1932.0, 75.40156862745104], [1940.0, 64.2293314162472], [1948.0, 56.25486725663721], [1980.0, 101.07824726134585], [1972.0, 46.58130081300811], [1964.0, 104.7161107168204], [1988.0, 71.59681818181815], [1996.0, 77.2208883553421], [2004.0, 143.48467966573807], [2012.0, 18.758373205741616], [2044.0, 92.53544494720987], [2036.0, 83.33269889607915], [2020.0, 78.8997830802605], [2028.0, 138.07920792079202], [2056.0, 97.56955380577435], [2072.0, 87.84129692832752], [2088.0, 82.71509510319702], [2104.0, 61.742857142857105], [2168.0, 76.77086330935262], [2152.0, 86.63676535572242], [2120.0, 52.480952380952395], [2136.0, 95.35863267670902], [2200.0, 211.0], [2184.0, 112.21714285714283], [2280.0, 75.10219922380334], [2296.0, 56.762859633827404], [2216.0, 107.60287610619471], [2232.0, 88.67726161369207], [2248.0, 104.98696558915537], [2264.0, 178.95833333333334], [2312.0, 95.25877494838261], [2328.0, 50.62803234501346], [2344.0, 92.89329268292674], [2360.0, 172.50000000000003], [2424.0, 117.68487636572748], [2408.0, 120.46491228070175], [2376.0, 91.87295597484271], [2392.0, 94.72040302267], [2440.0, 60.471135940409724], [2456.0, 68.75614489003871], [2472.0, 102.33526405451447], [2488.0, 64.74076809453472], [2552.0, 115.98930269413623], [2536.0, 59.68799646954975], [2504.0, 86.58658704639426], [2520.0, 100.50817120622563], [2584.0, 137.30702702702666], [2568.0, 113.31678399407161], [2664.0, 133.1298701298703], [2600.0, 117.24345335515558], [2616.0, 186.4253968253969], [2632.0, 123.41536705971843], [2648.0, 127.73553719008267], [2712.0, 110.32656587473004], [2808.0, 118.2763209393346], [2728.0, 116.02023809523813], [2744.0, 116.04480494399407], [2760.0, 124.2344422700589], [2776.0, 128.98187995470022], [2824.0, 133.54024496937885], [2920.0, 179.66855753646692], [2936.0, 136.92700124429703], [2872.0, 134.22345726331952], [2888.0, 118.96504854368919], [2904.0, 140.80888548448848], [2984.0, 129.73258513931881], [3000.0, 134.73148148148155], [3016.0, 150.43231939163485], [3032.0, 130.97670682730953], [3064.0, 123.98337765957439], [3048.0, 216.0], [3112.0, 150.87736593059927], [3128.0, 226.51598173515998], [3144.0, 155.91852487135463], [3176.0, 120.37922556853087], [3192.0, 141.1857198595393], [3160.0, 213.0], [3240.0, 102.3695014662757], [3256.0, 134.04608661104487], [3320.0, 171.87326120556403], [3272.0, 163.16903027980052], [3288.0, 162.8712563204979], [3304.0, 135.23882957690802], [3224.0, 212.4], [3208.0, 212.0], [3336.0, 125.98737221888172], [3352.0, 163.71597167584568], [3368.0, 153.03342508847814], [3384.0, 170.17544783983152], [3400.0, 168.88090664617795], [3416.0, 113.09620991253647], [3448.0, 107.86428834130197], [3432.0, 313.0], [3480.0, 88.63983679525238], [3496.0, 101.07710989678213], [3528.0, 162.38888888888886], [3544.0, 199.34957020057308], [3560.0, 180.9265220433868], [3576.0, 219.0], [3624.0, 158.66509062253792], [3640.0, 93.93613070924619], [3656.0, 175.62368932038828], [3672.0, 231.11507936507957], [3688.0, 179.74127126231], [3704.0, 169.91300877893062], [3592.0, 408.6666666666667], [3736.0, 214.78107764106971], [3752.0, 225.92101855848134], [3768.0, 234.724039013196], [3800.0, 229.12068965517233], [3816.0, 90.57754206291139], [3832.0, 161.51418298042321], [3848.0, 232.2044877222694], [3864.0, 285.03103448275886], [3880.0, 254.51838565022427], [3896.0, 234.07198748043797], [3912.0, 95.95241663544374], [3928.0, 221.98163606010016], [3944.0, 169.56121495327102], [3960.0, 172.37379576107907], [3976.0, 184.5543562066308], [3992.0, 205.4635482511588], [4008.0, 290.14120667522405], [4040.0, 254.74955752212358], [4056.0, 185.83809523809504], [4072.0, 134.08571428571418], [4088.0, 186.3471502590674], [4024.0, 397.0], [4112.0, 444.0], [4176.0, 252.95855535820047], [4240.0, 239.12556421830118], [4272.0, 389.0], [4208.0, 393.0], [4368.0, 249.40522063393422], [4400.0, 84.43614130434784], [4432.0, 234.5831809872029], [4464.0, 408.5352112676056], [4592.0, 230.77260165811342], [4624.0, 420.0], [4752.0, 403.1444652908068], [4816.0, 188.36024340770834], [4848.0, 163.14655172413788], [4720.0, 220.28571428571428], [4880.0, 235.47431906614725], [4912.0, 313.2142857142857], [4944.0, 148.75491329479763], [4976.0, 236.92654690618755], [4113.0, 136.17599186164796], [4145.0, 146.64424514200329], [4177.0, 288.8322626695216], [4209.0, 151.61874294316905], [4241.0, 242.12852311161268], [4273.0, 278.1851559415719], [4305.0, 168.09372517871313], [4337.0, 109.30258146424045], [4369.0, 327.328052190121], [4401.0, 268.3030840127616], [4433.0, 240.94663382594376], [4465.0, 155.82099490795167], [4497.0, 228.6107554417414], [4529.0, 46.26009457984725], [4561.0, 229.5099846390168], [4593.0, 272.75], [4625.0, 199.26939571150064], [4657.0, 251.50465022240223], [4689.0, 196.86600397614293], [4721.0, 239.03871773522067], [4753.0, 158.99430199430222], [4785.0, 149.30519480519467], [4817.0, 238.85997666277683], [4849.0, 188.54901079136675], [4881.0, 156.05120481927713], [4913.0, 218.5142160844843], [4945.0, 211.18874773139748], [2073.0, 89.64059900166404], [2057.0, 86.72269624573393], [2153.0, 57.37113402061854], [2169.0, 63.586399627387095], [2089.0, 123.35681470137835], [2105.0, 74.57136128120595], [2121.0, 93.15965508231], [2137.0, 61.60382165605098], [2185.0, 96.43231247225926], [2201.0, 102.94324122479465], [2217.0, 95.92659856223979], [2233.0, 156.72972972972977], [2249.0, 83.60362694300517], [2297.0, 75.16824512534805], [2281.0, 109.2495726495727], [2265.0, 101.3992606284658], [2313.0, 98.60978203083462], [2329.0, 87.4045823665893], [2345.0, 131.9328358208955], [2361.0, 84.28084526244044], [2425.0, 45.625000000000014], [2409.0, 104.24539700805516], [2377.0, 90.4259624876605], [2393.0, 100.17789072426937], [2441.0, 100.76934523809506], [2457.0, 123.5482275350372], [2473.0, 99.61688311688319], [2489.0, 115.85142417244042], [2537.0, 52.58562367864693], [2505.0, 88.54923717059653], [2521.0, 56.192355117139314], [2585.0, 90.16715976331352], [2569.0, 207.0], [2665.0, 96.56274768824301], [2681.0, 131.97031963470326], [2601.0, 81.86343612334802], [2617.0, 177.53571428571433], [2633.0, 122.42332449829595], [2649.0, 119.99100449775115], [2713.0, 109.66761363636341], [2697.0, 114.81328751431832], [2809.0, 182.11751152073742], [2841.0, 139.04785415875423], [2825.0, 115.61389961389966], [2921.0, 101.94777158774357], [2937.0, 87.56213017751479], [2857.0, 149.11059190031165], [2873.0, 381.25], [2889.0, 126.65460910151701], [2905.0, 356.0], [2953.0, 146.12013600302265], [2969.0, 138.27722377343449], [2985.0, 141.80045696877335], [3001.0, 210.8333333333333], [3065.0, 131.9211315902275], [3049.0, 175.6001150747985], [3033.0, 105.66666666666666], [3017.0, 209.0], [3081.0, 134.57395751376902], [3097.0, 155.14862804878067], [3129.0, 128.7877145438121], [3177.0, 151.7749510763208], [3161.0, 201.74895397489533], [3145.0, 212.8], [3113.0, 214.0], [3209.0, 156.65588464536228], [3225.0, 149.19642162582693], [3241.0, 159.08942258559068], [3257.0, 162.11395348837183], [3305.0, 204.33333333333334], [3273.0, 195.66529492455422], [3321.0, 212.0], [3289.0, 211.42857142857142], [3385.0, 81.2091062394603], [3417.0, 153.90076335877856], [3433.0, 164.94300314465394], [3337.0, 210.42857142857142], [3465.0, 153.5697674418605], [3497.0, 221.57975580937335], [3513.0, 150.580601092896], [3529.0, 141.93963500234008], [3545.0, 132.95178719867013], [3561.0, 103.40059523809525], [3577.0, 160.16881028938917], [3481.0, 412.3333333333333], [3593.0, 162.55233680957932], [3609.0, 97.71662328002972], [3625.0, 103.87931034482759], [3641.0, 218.48205128205123], [3657.0, 76.85340314136134], [3673.0, 160.8440021516945], [3689.0, 103.58120300751887], [3705.0, 160.2441814595661], [3721.0, 146.96007462686507], [3769.0, 163.6116152450092], [3785.0, 244.56091818716905], [3801.0, 166.66064516129035], [3833.0, 170.37209302325576], [3753.0, 404.83333333333337], [3849.0, 142.68376068376054], [3865.0, 208.19199999999992], [3881.0, 295.76548672566327], [3897.0, 348.3310463121783], [3913.0, 244.79806918744993], [3929.0, 308.63098591549306], [3945.0, 162.06531531531536], [3993.0, 212.13342696629226], [4009.0, 190.53856655290102], [4025.0, 82.26914329037146], [4041.0, 226.43209876543182], [4073.0, 185.50495834986063], [4089.0, 288.4936332767407], [4114.0, 95.31241830065363], [4178.0, 98.21264994547437], [4210.0, 238.73916500994054], [4242.0, 99.28845184064542], [4274.0, 101.1036802532645], [4306.0, 210.2167990919412], [4338.0, 84.89530685920585], [4370.0, 106.873798076923], [4402.0, 340.0], [4434.0, 102.53641456582623], [4466.0, 184.54803843074478], [4498.0, 384.35135135135124], [4530.0, 96.16839237057204], [4562.0, 200.34144515162856], [4594.0, 213.67423678332077], [4626.0, 189.12308898471207], [4690.0, 189.0862470862472], [4786.0, 256.0505249343836], [4850.0, 222.1228070175442], [4754.0, 216.8], [4722.0, 219.5], [4882.0, 185.13797814207646], [4914.0, 111.77777777777773], [4978.0, 192.1106671993609], [4946.0, 206.0], [4115.0, 286.1460122699383], [4147.0, 259.8030365203119], [4211.0, 394.2316384180789], [4243.0, 224.28533333333323], [4275.0, 322.3333333333333], [4307.0, 127.47058823529412], [4339.0, 223.18034557235418], [4371.0, 193.20982142857144], [4403.0, 123.49050019387329], [4435.0, 264.00398142003957], [4467.0, 377.4060240963858], [4499.0, 145.27549824150057], [4531.0, 111.61147587781886], [4595.0, 224.66666666666666], [4627.0, 284.0], [4659.0, 224.8740910830455], [4691.0, 208.02457002456993], [4723.0, 184.95005898545003], [4755.0, 275.0844537815122], [4787.0, 181.11361897475095], [4819.0, 168.95588235294125], [4883.0, 301.5171779141108], [4915.0, 173.0637795275589], [4947.0, 314.47689182326076], [4979.0, 390.6554508748318], [1037.0, 93.32741617357011], [1029.0, 72.0], [1085.0, 53.922813036020564], [1077.0, 64.0], [1061.0, 64.2], [1069.0, 50.16426799007448], [1045.0, 19.480072463768114], [1117.0, 51.45721694036295], [1101.0, 60.86788399570354], [1109.0, 60.363790186125186], [1141.0, 49.039709812905656], [1149.0, 23.07305034550837], [1125.0, 46.878831076265115], [1133.0, 58.375967228038164], [1165.0, 48.280965571824396], [1157.0, 28.54901960784314], [1181.0, 32.83011583011575], [1173.0, 20.170876671619606], [1213.0, 32.274975272007936], [1205.0, 76.71140939597313], [1189.0, 48.2516578249336], [1197.0, 71.75961538461537], [1229.0, 28.36784140969164], [1221.0, 47.79008152173923], [1245.0, 26.25505050505054], [1237.0, 51.59723865877713], [1277.0, 62.790014684287826], [1269.0, 53.495999999999974], [1253.0, 65.46111493461807], [1261.0, 46.691891891891935], [1293.0, 59.30325443786981], [1309.0, 58.04223433242501], [1301.0, 59.85487243831035], [1333.0, 45.870813397129155], [1341.0, 54.029829545454575], [1317.0, 29.571428571428562], [1357.0, 44.13043478260873], [1349.0, 65.0], [1373.0, 61.31469648562309], [1365.0, 57.714788732394425], [1405.0, 23.58246346555324], [1397.0, 61.28598940779979], [1381.0, 57.79283582089555], [1389.0, 55.60655134339342], [1413.0, 61.982608695652175], [1437.0, 26.125], [1429.0, 57.075829383886266], [1421.0, 57.11021505376346], [1445.0, 65.54217854217825], [1453.0, 54.23400601116372], [1485.0, 69.30297029702973], [1477.0, 34.75], [1501.0, 61.81250000000004], [1493.0, 61.839375000000004], [1533.0, 57.46231155778904], [1525.0, 45.280898876404486], [1509.0, 69.83825738607923], [1517.0, 63.21612903225802], [1541.0, 80.0], [1549.0, 89.90322580645163], [1565.0, 80.6618525896413], [1589.0, 69.53924914675785], [1573.0, 70.04388531304863], [1581.0, 75.45524691358045], [1557.0, 54.82993197278912], [1605.0, 63.89479315263911], [1621.0, 56.944091486658195], [1613.0, 48.04784240150096], [1653.0, 80.30654627539526], [1661.0, 19.950000000000003], [1629.0, 64.5157465728049], [1637.0, 69.37052631578955], [1645.0, 59.06832797427653], [1669.0, 63.81533101045302], [1677.0, 70.77737665463282], [1685.0, 108.20983213429244], [1693.0, 58.44999999999998], [1717.0, 68.74355670103101], [1701.0, 70.48714883442925], [1709.0, 76.34065934065931], [1733.0, 123.5], [1741.0, 1.1875], [1757.0, 65.832966226138], [1789.0, 67.05970924195233], [1765.0, 71.0], [1773.0, 60.062794348508646], [1797.0, 92.60254372019075], [1805.0, 92.06250000000014], [1813.0, 63.17039106145247], [1821.0, 63.48284313725491], [1853.0, 64.61570247933885], [1845.0, 74.3006024096384], [1829.0, 80.24999999999999], [1837.0, 77.43127629733527], [1869.0, 91.84436701509887], [1861.0, 70.76729559748429], [1909.0, 59.002341920374704], [1917.0, 65.58861940298507], [1877.0, 66.83023648648634], [1885.0, 55.27008310249305], [1893.0, 97.76289398280808], [1901.0, 75.84139571768435], [1925.0, 74.47412882787745], [1933.0, 92.32164129715416], [1941.0, 143.38647342995174], [1949.0, 102.75735294117653], [1981.0, 70.04860822600729], [1973.0, 41.373913043478254], [1957.0, 100.0614136732329], [1965.0, 76.0786163522013], [1989.0, 94.41503267973854], [1997.0, 21.75182481751825], [2005.0, 54.349009900990076], [2013.0, 64.0647751605996], [2045.0, 172.48456790123453], [2037.0, 185.3559322033898], [2021.0, 102.38372093023254], [2029.0, 59.80703745743466], [2058.0, 91.73353989155697], [2074.0, 34.63043478260866], [2090.0, 79.95444989488443], [2106.0, 150.0232142857145], [2170.0, 117.6052356020942], [2154.0, 49.829581993569164], [2122.0, 127.82352941176472], [2138.0, 99.41527446300722], [2186.0, 196.36475409836072], [2282.0, 46.77386934673364], [2298.0, 30.373076923076923], [2234.0, 94.02232327408042], [2250.0, 111.53500583430575], [2266.0, 107.66362883181449], [2314.0, 104.31635388739939], [2330.0, 104.84482758620706], [2346.0, 66.53882352941184], [2362.0, 131.46323529411768], [2426.0, 94.58988525286858], [2410.0, 97.43850482315096], [2378.0, 123.58564013840841], [2394.0, 111.636890951276], [2442.0, 17.479729729729733], [2458.0, 162.5936675461742], [2474.0, 76.90505548705298], [2490.0, 108.21084337349406], [2554.0, 115.29103343465029], [2538.0, 46.363346613545815], [2506.0, 68.81412639405202], [2522.0, 24.259259259259256], [2570.0, 111.61799466260008], [2586.0, 118.9685462217109], [2618.0, 117.22012257405507], [2650.0, 103.6883239171375], [2666.0, 123.99009900990137], [2794.0, 146.68021680216825], [2698.0, 142.3277126099708], [2810.0, 115.88698630137009], [2730.0, 129.94920394238048], [2746.0, 158.99862258953178], [2762.0, 142.18521341463398], [2778.0, 224.0], [2922.0, 147.3740856844306], [2938.0, 147.97093690248573], [2858.0, 139.7894736842105], [2874.0, 123.36476523088821], [2890.0, 93.73529411764707], [2906.0, 148.93661202185805], [2842.0, 367.0], [2826.0, 368.0], [3050.0, 139.90053970701635], [2970.0, 103.69230769230768], [3066.0, 212.0], [2986.0, 149.0], [3002.0, 139.61223610512684], [3018.0, 157.14982973893316], [3034.0, 140.30424620179187], [3114.0, 222.99631675874778], [3146.0, 156.30313588850166], [3162.0, 121.52360282148678], [3178.0, 209.0], [3194.0, 145.85908385093154], [3130.0, 214.2], [3242.0, 95.41352201257858], [3258.0, 120.38285024154588], [3322.0, 137.1347293559859], [3274.0, 127.04751501911507], [3290.0, 153.52299298519094], [3306.0, 161.61702940053453], [3226.0, 211.0], [3210.0, 212.0], [3338.0, 176.00668337510425], [3354.0, 165.818829113924], [3370.0, 149.19127386053782], [3386.0, 168.03473848555842], [3402.0, 145.3153081510938], [3418.0, 170.4338521400778], [3434.0, 171.23914728682135], [3450.0, 241.46955128205136], [3466.0, 170.4804246848045], [3482.0, 225.8647362157875], [3514.0, 136.10235507246387], [3530.0, 100.24307205067295], [3546.0, 221.6590038314176], [3562.0, 101.87563195146606], [3594.0, 249.71428571428572], [3626.0, 165.97682639434413], [3642.0, 243.7258297258298], [3658.0, 102.72396166134192], [3674.0, 166.46610169491527], [3690.0, 347.18181818181813], [3706.0, 176.85654008438843], [3610.0, 408.8571428571429], [3722.0, 242.5059308922121], [3754.0, 122.80883444691928], [3770.0, 168.64516129032245], [3786.0, 266.5535714285709], [3802.0, 203.63013698630124], [3818.0, 238.11558669001744], [3834.0, 402.0], [3738.0, 413.0], [3850.0, 201.37999999999994], [3866.0, 152.62209014363538], [3882.0, 171.43421052631584], [3898.0, 107.76291955247736], [3930.0, 167.88718662952652], [3946.0, 106.96818862275438], [3962.0, 125.33897681266102], [3914.0, 492.75], [3978.0, 176.83110236220443], [3994.0, 211.75362318840584], [4010.0, 152.92808551992226], [4042.0, 177.0408496732026], [4074.0, 215.0], [4090.0, 154.94473368041653], [4058.0, 396.7], [4026.0, 398.5], [4148.0, 181.66666666666666], [4180.0, 249.27422518634748], [4212.0, 233.93915343915342], [4276.0, 198.5789473684212], [4308.0, 89.09345794392512], [4340.0, 276.5538461538464], [4244.0, 392.72727272727275], [4372.0, 226.25150732127466], [4404.0, 212.0], [4436.0, 249.76716738197467], [4468.0, 207.38590203106327], [4500.0, 305.5557377049178], [4788.0, 184.0], [4820.0, 408.84104046242726], [4852.0, 177.0], [4756.0, 218.0], [4660.0, 223.0], [4628.0, 224.33333333333334], [4884.0, 100.65380374862175], [4916.0, 415.1734860883797], [4948.0, 114.89527027027025], [4980.0, 203.77000000000035], [4117.0, 126.95309168443505], [4149.0, 115.71574952561667], [4181.0, 128.615977575333], [4213.0, 105.05319645356984], [4245.0, 178.9927425515659], [4277.0, 213.23195020746869], [4309.0, 253.37069323370676], [4341.0, 183.18414130026278], [4373.0, 165.9584093396574], [4405.0, 179.02288428324687], [4437.0, 139.40525587828483], [4469.0, 135.75572519083985], [4501.0, 274.3758389261745], [4533.0, 219.30626450116011], [4565.0, 193.3786602486962], [4597.0, 233.7824701195222], [4629.0, 203.71495509566614], [4661.0, 217.67635903919108], [4693.0, 216.3027888446221], [4725.0, 193.56544293695134], [4757.0, 234.1041033434649], [4789.0, 245.78089552238816], [4821.0, 233.78624338624294], [4853.0, 238.1189591078067], [4885.0, 151.67493472584883], [4917.0, 218.09790922998465], [4949.0, 184.32191780821898], [4981.0, 203.0], [2059.0, 85.89590592334505], [2075.0, 87.9956958393114], [2091.0, 101.77065923862587], [2107.0, 65.65207006369432], [2171.0, 53.46153846153847], [2155.0, 99.3170658682637], [2123.0, 84.3948220064725], [2139.0, 119.26175869120652], [2203.0, 98.59807692307695], [2187.0, 96.49539028887529], [2299.0, 75.59376454164736], [2283.0, 92.99762470308788], [2251.0, 101.59879032258064], [2267.0, 93.01348547717829], [2315.0, 87.8388738127545], [2331.0, 119.22869955156952], [2347.0, 98.04060638873858], [2363.0, 125.30352303523036], [2427.0, 61.11646063760567], [2411.0, 164.5569620253166], [2379.0, 97.39061345158903], [2395.0, 78.67085076708514], [2443.0, 85.41599999999995], [2459.0, 74.64934478084034], [2475.0, 97.52238805970147], [2491.0, 95.66714645555976], [2555.0, 198.74656679151062], [2539.0, 88.16342412451358], [2507.0, 119.1039686975964], [2523.0, 47.147368421052626], [2571.0, 126.0], [2587.0, 112.0769230769231], [2603.0, 125.96906448005997], [2619.0, 121.14744351961936], [2683.0, 125.53570035115104], [2651.0, 148.6717325227966], [2699.0, 76.00961538461527], [2715.0, 185.60689655172416], [2731.0, 229.49999999999994], [2747.0, 114.56043388429747], [2795.0, 128.90387596899174], [2779.0, 146.2252448313383], [2811.0, 371.0], [2843.0, 131.52697095435684], [2827.0, 147.0162287480682], [2923.0, 101.75890410958905], [2939.0, 201.0], [2859.0, 125.6820324777368], [2891.0, 120.11528150134023], [2907.0, 99.68903225806446], [2987.0, 132.81451919422256], [3003.0, 201.5533230293663], [3035.0, 181.66666666666666], [3051.0, 98.20467836257315], [3067.0, 136.61373225930194], [3019.0, 215.5], [3083.0, 146.13553398058264], [3099.0, 134.6072270227811], [3115.0, 134.77464091134235], [3131.0, 156.31983186855223], [3179.0, 188.36491228070182], [3195.0, 151.93932411674348], [3163.0, 201.27032321253682], [3147.0, 214.0], [3211.0, 151.5471255377394], [3227.0, 147.27385892116166], [3243.0, 141.11242138364764], [3307.0, 208.0], [3275.0, 156.9065588499545], [3339.0, 130.35884476534306], [3403.0, 220.9], [3419.0, 131.89035667106998], [3435.0, 247.55555555555557], [3451.0, 111.05936073059367], [3371.0, 210.0], [3467.0, 171.67182962245892], [3483.0, 158.3370058327933], [3499.0, 155.12321359598317], [3515.0, 221.0], [3531.0, 64.79462439696779], [3547.0, 255.26659696811225], [3563.0, 315.2627565982398], [3579.0, 111.53004852556924], [3595.0, 166.85880077369433], [3611.0, 246.31407942238266], [3627.0, 232.5869565217391], [3643.0, 124.40407470288623], [3675.0, 204.25124131082396], [3691.0, 239.92269118261567], [3707.0, 98.18627450980416], [3659.0, 407.8333333333333], [3723.0, 202.96848739495843], [3739.0, 166.3994511956097], [3755.0, 392.125], [3771.0, 100.18102697998259], [3787.0, 87.78963299281132], [3803.0, 161.7478126608337], [3819.0, 230.35759096612284], [3835.0, 123.83485235143999], [3851.0, 227.19919517102616], [3867.0, 177.39652509652532], [3883.0, 76.12825933756159], [3899.0, 223.39772138788183], [3931.0, 72.43750000000003], [3947.0, 91.92647058823529], [3963.0, 213.95856353591157], [3979.0, 175.9093097913323], [3995.0, 173.0112359550562], [4027.0, 259.38819751104023], [4043.0, 91.40392156862751], [4059.0, 192.22779313067522], [4075.0, 164.5813408345052], [4118.0, 91.64991624790619], [4150.0, 226.4514212982609], [4182.0, 85.17285067873313], [4214.0, 251.33630952380958], [4278.0, 188.4195083267246], [4310.0, 207.03900060938435], [4374.0, 217.13725490196077], [4406.0, 194.89999999999986], [4438.0, 88.55296610169493], [4470.0, 229.13110047846885], [4502.0, 118.59586466165409], [4534.0, 223.83325548808963], [4598.0, 132.35929270127923], [4566.0, 226.0], [4630.0, 186.1496913580245], [4662.0, 163.21412803532002], [4726.0, 242.02046548956707], [4758.0, 134.41823179111327], [4790.0, 294.9297475301865], [4822.0, 226.36397670549067], [4886.0, 248.87038089823756], [4918.0, 142.11386138613872], [4950.0, 228.97815912636565], [4982.0, 188.7105263157896], [4119.0, 214.14285714285714], [4183.0, 250.0346774193552], [4215.0, 246.74178935447353], [4247.0, 241.95360000000016], [4279.0, 147.1087202718006], [4311.0, 81.25480769230768], [4343.0, 205.16086434573788], [4375.0, 275.5628902765385], [4439.0, 193.70535714285742], [4503.0, 174.84901531728664], [4535.0, 197.19150579150588], [4567.0, 203.8857692307694], [4663.0, 324.0], [4695.0, 176.24743083003926], [4759.0, 328.3052837573381], [4791.0, 172.3462955382726], [4855.0, 173.51623272259724], [4727.0, 219.92857142857144], [4631.0, 224.0], [4887.0, 259.45474254742504], [4919.0, 220.3607198748046], [4951.0, 144.6], [4983.0, 336.78289473684214], [519.0, 9.923473774720556], [515.0, 11.662004662004653], [527.0, 41.487726787620076], [523.0, 10.381165919282497], [543.0, 11.522292993630577], [539.0, 41.965141612200384], [531.0, 43.592473118279536], [535.0, 40.17514124293786], [547.0, 10.454950936663685], [559.0, 9.65641025641026], [555.0, 19.935975609756145], [551.0, 10.534985422740538], [575.0, 19.615568862275456], [567.0, 13.613180515759318], [583.0, 22.288656423667817], [579.0, 37.806400000000004], [591.0, 10.178260869565218], [587.0, 41.41141141141144], [603.0, 26.971419884463334], [607.0, 11.53426640926641], [595.0, 29.335581787521082], [599.0, 10.089858793324769], [615.0, 25.42836624775581], [611.0, 11.39732685297689], [623.0, 17.4140350877193], [619.0, 31.87758524315267], [639.0, 32.49527491408926], [635.0, 16.811743612729735], [627.0, 22.9809027777778], [631.0, 17.98044009779953], [643.0, 24.54025974025973], [655.0, 26.115425344158094], [647.0, 25.75431654676257], [667.0, 24.91589819254882], [671.0, 27.60973489787047], [659.0, 26.05733862243053], [663.0, 30.512163222600037], [651.0, 26.11825652018582], [687.0, 1.0], [675.0, 15.00888888888889], [699.0, 26.42424242424243], [703.0, 12.307692307692307], [691.0, 0.8793103448275861], [695.0, 47.58925476603118], [711.0, 33.59302325581395], [707.0, 11.29454170957774], [719.0, 13.639393939393939], [715.0, 38.891112890312264], [731.0, 59.0], [735.0, 56.78793418647171], [723.0, 19.856915739268672], [727.0, 14.381818181818186], [743.0, 34.304787592717396], [739.0, 33.53785211267607], [751.0, 29.87648541591635], [747.0, 47.73263157894737], [767.0, 34.41050724637673], [763.0, 24.185915492957747], [755.0, 30.474215650919543], [759.0, 30.113660810326316], [775.0, 31.810888252149006], [771.0, 29.37585339561624], [779.0, 39.09227799227804], [783.0, 31.386898298950413], [799.0, 14.730094466936574], [795.0, 14.62381989832967], [787.0, 35.222820919176], [791.0, 14.966527196652727], [807.0, 54.3818565400844], [803.0, 26.45859429366735], [815.0, 41.0952109464083], [811.0, 47.03975799481418], [831.0, 22.604135893648447], [827.0, 33.66849816849811], [819.0, 33.228488792480135], [823.0, 38.41320553780627], [839.0, 51.087179487179505], [835.0, 19.757517594369784], [847.0, 16.031746031746035], [843.0, 43.93699076588818], [863.0, 36.99753997539968], [859.0, 59.05421245421246], [851.0, 53.2032258064516], [855.0, 38.481349206349186], [871.0, 34.532229024126785], [879.0, 17.996023856858873], [875.0, 18.97988826815641], [867.0, 33.406700288184474], [891.0, 37.74897568970224], [895.0, 36.793286942284055], [883.0, 48.747859922179046], [887.0, 18.564655172413804], [903.0, 37.95348837209303], [899.0, 0.8499999999999999], [911.0, 79.0], [907.0, 19.215144230769237], [927.0, 36.647003745318315], [923.0, 30.80089153046059], [915.0, 58.40117416829743], [919.0, 37.2944104134763], [935.0, 48.001768867924504], [931.0, 34.829393627954765], [943.0, 21.8920704845815], [939.0, 22.933381607530766], [955.0, 58.424242424242415], [959.0, 66.32285115303982], [947.0, 30.193548387096765], [951.0, 39.72509960159365], [967.0, 68.38672922252013], [963.0, 57.67976804123714], [975.0, 40.610582413399335], [971.0, 50.75132743362829], [991.0, 41.75953079178883], [987.0, 49.05473098330247], [979.0, 27.48309492847854], [983.0, 46.00408663669805], [999.0, 20.12758906379453], [995.0, 52.51191658391272], [1007.0, 27.957960644007176], [1003.0, 66.37292817679555], [1023.0, 27.089185033316284], [1019.0, 48.40334572490704], [1011.0, 8.8125], [1015.0, 15.622093023255811], [1038.0, 15.189845474613675], [1030.0, 30.755643340857766], [1054.0, 50.88822874118093], [1046.0, 46.85133650677404], [1086.0, 43.964895173086326], [1078.0, 43.6096667887221], [1062.0, 43.71985428051006], [1070.0, 19.632218844984784], [1102.0, 29.081686429512498], [1094.0, 48.07039274924464], [1118.0, 23.46107784431136], [1110.0, 18.738317757009362], [1150.0, 57.144268774703605], [1142.0, 31.338235294117645], [1126.0, 56.82384028185559], [1134.0, 36.450310559006184], [1158.0, 46.088733798604174], [1174.0, 46.19349962207103], [1166.0, 21.43269230769231], [1214.0, 51.24148936170211], [1206.0, 40.74344176285411], [1190.0, 42.69434269434265], [1198.0, 66.60873605947944], [1230.0, 55.59829867674869], [1222.0, 65.0995348837209], [1246.0, 67.4449254449255], [1238.0, 49.89917849141153], [1278.0, 50.220572640508955], [1270.0, 57.422413793103516], [1254.0, 39.17319749216305], [1262.0, 60.75655644241739], [1286.0, 57.54420374707243], [1294.0, 50.350148367952535], [1310.0, 28.106194690265493], [1342.0, 71.55301794453501], [1334.0, 97.61075949367086], [1318.0, 53.166371681415896], [1326.0, 63.960208741030684], [1302.0, 52.442682926829285], [1350.0, 64.18043621943161], [1366.0, 38.641391614629796], [1358.0, 77.67028704422029], [1406.0, 56.38188539741221], [1398.0, 57.79891304347827], [1382.0, 75.07906976744187], [1390.0, 5.290322580645163], [1422.0, 62.74072216649942], [1414.0, 61.680397727272656], [1438.0, 61.28359866716035], [1430.0, 64.47757136384227], [1470.0, 57.067498165810534], [1462.0, 65.6593245227606], [1446.0, 59.986781609195354], [1454.0, 69.96078431372558], [1478.0, 64.34205536594597], [1486.0, 34.5], [1502.0, 0.8], [1494.0, 8.466666666666667], [1534.0, 63.207906295753986], [1526.0, 73.29692011549561], [1510.0, 64.3604336043361], [1518.0, 51.10639569635383], [1550.0, 66.97060218112841], [1542.0, 78.42436816295742], [1566.0, 52.88931443891238], [1558.0, 64.57749287749301], [1598.0, 87.02501302761866], [1590.0, 60.417085427135675], [1574.0, 60.97386759581888], [1582.0, 58.192069392812975], [1606.0, 94.11022727272733], [1622.0, 74.8028953229397], [1614.0, 74.49291435613043], [1654.0, 17.330148619957566], [1662.0, 72.59213941416397], [1630.0, 53.867647058823515], [1638.0, 65.4263100436683], [1646.0, 73.69692307692296], [1670.0, 77.2287029930929], [1678.0, 78.39456662354456], [1686.0, 79.74396135265708], [1694.0, 74.30413140866115], [1726.0, 68.20672713529842], [1718.0, 70.0], [1702.0, 74.7050179211469], [1710.0, 69.25367362722362], [1734.0, 79.94858478317323], [1742.0, 81.74667624865253], [1750.0, 80.47608370702525], [1758.0, 64.95654853620977], [1790.0, 109.59898477157367], [1782.0, 67.21335200746968], [1766.0, 68.81703703703697], [1774.0, 80.17918088737188], [1798.0, 85.13947876447904], [1806.0, 65.0349378881986], [1814.0, 88.9545454545455], [1822.0, 89.13336103032822], [1854.0, 64.68877551020417], [1846.0, 54.64179104477613], [1830.0, 78.90191481047283], [1838.0, 39.82605775688377], [1862.0, 68.13000817661478], [1870.0, 55.72810675562976], [1878.0, 112.06696428571429], [1886.0, 91.94649350649331], [1918.0, 92.82707774798925], [1910.0, 84.87441130298282], [1894.0, 72.59622514324215], [1902.0, 73.1800382043935], [1926.0, 53.16961130742047], [1934.0, 31.88355464759963], [1942.0, 133.1803278688524], [1950.0, 77.06185198426864], [1982.0, 70.13619810633642], [1974.0, 64.67607726597316], [1958.0, 60.15763546798033], [1966.0, 80.60777150448384], [1998.0, 53.23669467787107], [1990.0, 66.97480201583872], [2038.0, 81.23529411764699], [2046.0, 89.62881355932196], [2006.0, 77.43568981625641], [2014.0, 112.06149479659427], [2022.0, 42.5], [2030.0, 92.18871725990596], [2060.0, 90.00966183574883], [2076.0, 81.4693414080241], [2092.0, 78.6137096774193], [2108.0, 100.84684684684682], [2172.0, 85.82370923913054], [2156.0, 110.264705882353], [2124.0, 104.48136645962731], [2140.0, 80.16087182148388], [2188.0, 97.76423735563515], [2204.0, 195.0], [2220.0, 105.00524541026626], [2236.0, 105.62992125984249], [2300.0, 128.49292709466823], [2252.0, 116.71917808219173], [2268.0, 120.99667036625958], [2316.0, 107.46742209631721], [2332.0, 92.14366837024426], [2348.0, 50.1164383561644], [2364.0, 57.51453488372093], [2428.0, 137.15879534565383], [2412.0, 74.7408854166666], [2380.0, 87.03128760529485], [2396.0, 127.91751527494914], [2444.0, 71.68423464711266], [2460.0, 129.12729748127995], [2476.0, 104.43547197640103], [2492.0, 63.276795005202885], [2556.0, 92.4897959183674], [2540.0, 60.28598484848486], [2508.0, 64.77010050251255], [2524.0, 175.5788235294117], [2572.0, 185.83333333333331], [2588.0, 126.6843525179855], [2636.0, 114.54855842185108], [2652.0, 124.62959076600235], [2668.0, 223.72000000000006], [2684.0, 216.77777777777777], [2716.0, 119.05807711078583], [2700.0, 116.47026022304802], [2812.0, 137.69591078066912], [2796.0, 372.0769230769231], [2732.0, 130.78312788906015], [2748.0, 123.09877003354457], [2764.0, 102.0], [2780.0, 107.00122399020812], [2844.0, 178.46969696969717], [2828.0, 139.2181610508284], [2924.0, 131.62213883677282], [2860.0, 104.01290322580647], [2876.0, 133.12057010785844], [2892.0, 168.56170052671158], [2908.0, 152.34852695942175], [2956.0, 128.29366895499587], [2972.0, 139.81917808219183], [3052.0, 173.87347931873492], [3004.0, 130.19466248037696], [3020.0, 133.88974854932286], [3036.0, 181.63172043010755], [3068.0, 215.0], [2988.0, 215.0], [3084.0, 189.06128550074746], [3100.0, 143.8679245283019], [3116.0, 160.95024271844673], [3148.0, 160.1290951638059], [3164.0, 146.73353115727008], [3180.0, 143.27853082641013], [3196.0, 212.5], [3212.0, 211.14285714285717], [3228.0, 202.00904977375578], [3260.0, 153.61721183800628], [3324.0, 170.84633027522926], [3276.0, 145.6919060052221], [3292.0, 165.98420038535633], [3308.0, 138.08307086614178], [3340.0, 148.17897178198666], [3356.0, 154.07479548110663], [3372.0, 170.78648648648635], [3388.0, 158.31828978622278], [3404.0, 145.1032608695653], [3420.0, 162.4006993006994], [3436.0, 155.6926829268294], [3452.0, 156.3346303501942], [3468.0, 156.30529461998273], [3484.0, 155.24761904761908], [3516.0, 167.7782340862419], [3548.0, 92.36850152905207], [3564.0, 128.41741357234318], [3500.0, 413.0], [3612.0, 240.68218442255989], [3628.0, 91.12629629629633], [3644.0, 101.04150763358778], [3660.0, 238.9866979655709], [3676.0, 132.01620745542965], [3692.0, 380.82812500000006], [3708.0, 245.31774101540253], [3724.0, 167.64902723735375], [3740.0, 114.06291635825322], [3756.0, 271.5673076923074], [3772.0, 84.24611223799855], [3788.0, 284.87308673469437], [3804.0, 192.24696645253428], [3836.0, 245.04570970328774], [3820.0, 400.5], [3852.0, 230.5705958549225], [3884.0, 212.15568862275416], [3900.0, 259.6711229946525], [3916.0, 121.48373676248106], [3932.0, 263.9631864815932], [3948.0, 237.23562300319477], [3964.0, 267.2909512761021], [3868.0, 400.0], [3980.0, 189.37209302325587], [3996.0, 194.22253864930826], [4012.0, 171.19713902548054], [4044.0, 249.08668941979514], [4076.0, 131.37758112094386], [4120.0, 257.94957983193245], [4152.0, 382.48551724137934], [4184.0, 363.6], [4216.0, 150.53444180522587], [4248.0, 393.3636363636364], [4280.0, 169.648], [4344.0, 85.0], [4376.0, 229.93441414885763], [4408.0, 229.48104174645738], [4472.0, 198.97259259259215], [4504.0, 234.32755298651276], [4568.0, 165.49062499999994], [4600.0, 160.89691943127963], [4440.0, 256.59999999999997], [4632.0, 289.0478668054113], [4760.0, 222.49865083648183], [4824.0, 182.85531754979368], [4856.0, 199.74607991906925], [4728.0, 220.0], [4696.0, 222.0], [4664.0, 223.16666666666666], [4888.0, 103.2511627906976], [4920.0, 245.98344204716497], [4952.0, 192.50721153846143], [4984.0, 96.78333333333347], [4121.0, 430.5], [4153.0, 110.23839332290041], [4185.0, 167.22746950019663], [4217.0, 126.72521551724145], [4249.0, 141.32749627421742], [4281.0, 234.8589364844904], [4313.0, 235.4899581589956], [4345.0, 158.0074128984435], [4377.0, 134.40851272015644], [4409.0, 176.17073170731703], [4441.0, 305.19341317365263], [4473.0, 256.53282122905006], [4505.0, 280.01780585870216], [4537.0, 98.05503999999985], [4569.0, 247.20349684312768], [4601.0, 259.59904013961574], [4633.0, 169.9322757779135], [4665.0, 257.9604449938194], [4697.0, 263.78156467854393], [4729.0, 189.25960784313716], [4761.0, 110.62025316455696], [4793.0, 249.978360382855], [4857.0, 208.0], [4889.0, 214.30905587668548], [4921.0, 83.80265339966822], [4985.0, 208.76398739164696], [2061.0, 95.00985626283384], [2077.0, 96.88077858880776], [2093.0, 93.01245847176087], [2109.0, 56.64393063583811], [2173.0, 82.36836628511982], [2157.0, 12.526666666666669], [2125.0, 78.84905660377359], [2141.0, 113.08131868131868], [2189.0, 95.92211838006222], [2205.0, 103.89212717638145], [2221.0, 113.3241505968779], [2301.0, 93.94176306342239], [2285.0, 84.16249640494684], [2253.0, 92.01492537313422], [2269.0, 94.99759036144579], [2317.0, 77.19143239625163], [2333.0, 84.73566878980874], [2349.0, 104.93536585365861], [2365.0, 64.79840546697037], [2429.0, 95.06830265848663], [2413.0, 114.54007398273733], [2381.0, 66.78651685393258], [2397.0, 63.68208092485546], [2445.0, 87.1482688391038], [2461.0, 65.04452466907337], [2477.0, 116.12599544937427], [2493.0, 171.10457516339872], [2509.0, 81.93621867881552], [2541.0, 99.0510563380281], [2525.0, 97.8298858773182], [2573.0, 120.4037950664136], [2589.0, 109.42067307692312], [2605.0, 142.40397350993342], [2621.0, 116.84541618718853], [2669.0, 128.83717472118954], [2685.0, 141.04918667699485], [2653.0, 128.20659062103914], [2717.0, 127.45888801879448], [2701.0, 118.6098484848485], [2749.0, 143.0], [2813.0, 208.0], [2765.0, 125.71210967250589], [2781.0, 125.76275028333984], [2797.0, 372.3636363636363], [2829.0, 110.82169576059856], [2845.0, 115.96306555863343], [2861.0, 202.83333333333331], [2877.0, 157.3262092238471], [2941.0, 144.16818837097517], [2909.0, 102.24019607843131], [2925.0, 354.16666666666663], [3053.0, 120.93985507246363], [2957.0, 132.60981132075474], [3069.0, 127.56210691823884], [2989.0, 176.3481751824819], [3005.0, 167.97983870967744], [3021.0, 195.28125000000009], [3037.0, 134.1386363636365], [3085.0, 121.08996359854392], [3101.0, 147.01176024279184], [3117.0, 144.95180722891567], [3133.0, 158.6420497362476], [3197.0, 153.74072672217972], [3181.0, 177.6755407653909], [3149.0, 201.33333333333334], [3165.0, 214.0], [3213.0, 159.3272262462718], [3229.0, 153.16906077348042], [3261.0, 147.51345029239803], [3309.0, 161.0], [3277.0, 154.1057246003095], [3389.0, 181.1026282853568], [3405.0, 166.79808153477214], [3421.0, 163.78861788617928], [3437.0, 97.00226244343898], [3453.0, 411.75], [3373.0, 210.0], [3469.0, 182.99473684210537], [3485.0, 160.13622843545514], [3517.0, 129.570909090909], [3533.0, 243.00195848021914], [3549.0, 174.67084337349374], [3565.0, 144.57046413502093], [3581.0, 326.60962566844904], [3501.0, 416.0], [3597.0, 168.03778135048253], [3613.0, 162.1289117234936], [3661.0, 179.04794520547946], [3677.0, 162.02125603864746], [3693.0, 107.65005537098537], [3709.0, 197.51085383502166], [3645.0, 406.6], [3629.0, 409.8], [3725.0, 175.66666666666669], [3789.0, 219.31257078142676], [3805.0, 180.38674496644308], [3821.0, 128.21841620626176], [3837.0, 403.0], [3757.0, 402.25], [3741.0, 408.0], [3853.0, 150.34658753709166], [3869.0, 100.24594992636216], [3885.0, 423.0], [3901.0, 96.19942473633753], [3917.0, 224.9395559210523], [3933.0, 348.3076923076925], [3949.0, 401.75], [3965.0, 170.78839590443695], [3981.0, 155.29571197411056], [3997.0, 130.68108108108117], [4013.0, 171.82624113475188], [4029.0, 143.37918075911364], [4045.0, 272.9698836413417], [4061.0, 189.09249274160092], [4077.0, 112.03775743707124], [4093.0, 86.9705003734129], [4122.0, 129.53941908713665], [4154.0, 341.15555555555557], [4218.0, 233.3494780793318], [4282.0, 104.94682320441991], [4314.0, 157.74556213017686], [4346.0, 295.1122589531684], [4250.0, 391.6363636363636], [4186.0, 393.8571428571429], [4378.0, 77.8765432098766], [4410.0, 189.70811287477912], [4442.0, 114.30793650793649], [4474.0, 234.4469214437366], [4506.0, 110.79971077368015], [4538.0, 71.74293785310732], [4570.0, 195.1554080437326], [4602.0, 197.05555555555557], [4634.0, 202.74437548487188], [4730.0, 247.40641076375215], [4762.0, 119.77994011976041], [4794.0, 282.875], [4826.0, 244.64917127071837], [4858.0, 280.0428849902541], [4698.0, 222.0], [4922.0, 190.02349624060088], [4954.0, 236.81863688871766], [4890.0, 207.11111111111111], [4155.0, 279.5305763308404], [4187.0, 218.66502866502853], [4251.0, 279.88792748248824], [4283.0, 175.48702742772426], [4347.0, 324.33881578947387], [4379.0, 238.02076802507847], [4411.0, 156.8183823529411], [4443.0, 261.66839154808093], [4475.0, 140.50811907983763], [4507.0, 210.4214773432649], [4539.0, 239.60765895953773], [4571.0, 326.4954954954955], [4603.0, 212.93595041322314], [4635.0, 367.40769230769206], [4667.0, 152.875928677563], [4699.0, 240.23470661672928], [4731.0, 124.0], [4763.0, 268.40589945990894], [4795.0, 189.91364687740992], [4827.0, 303.12942477876135], [4859.0, 164.5979729729732], [4891.0, 227.49654049654012], [4923.0, 365.84736842105275], [4955.0, 158.02173913043472], [1039.0, 32.63863636363636], [1031.0, 33.343908629441614], [1055.0, 56.075949367088654], [1087.0, 62.615931721194926], [1063.0, 56.3161984459056], [1071.0, 52.17317317317319], [1103.0, 63.81674208144799], [1095.0, 56.074380165289256], [1119.0, 50.87227926078033], [1111.0, 44.678858814923245], [1143.0, 46.637351778656075], [1151.0, 22.6808803301238], [1127.0, 29.25412221144521], [1135.0, 54.927211172238806], [1167.0, 47.721400216528316], [1159.0, 44.74855491329476], [1183.0, 50.44542253521123], [1175.0, 26.249999999999996], [1215.0, 44.974156118143384], [1207.0, 66.69482576557547], [1191.0, 59.82934131736528], [1199.0, 35.703005303476694], [1247.0, 28.699236641221344], [1223.0, 41.60543414057885], [1239.0, 53.83877159309023], [1231.0, 27.92927308447939], [1279.0, 55.218255428781774], [1271.0, 21.414062500000004], [1263.0, 59.968972204266315], [1295.0, 55.650922909880556], [1287.0, 61.62903225806451], [1311.0, 56.97327555074019], [1303.0, 62.82350292660965], [1335.0, 55.796364669128096], [1343.0, 49.79190004308498], [1319.0, 54.389655172413775], [1327.0, 51.577380952380956], [1359.0, 56.20414548298792], [1351.0, 58.85381026438568], [1375.0, 83.89758106021613], [1367.0, 74.33031358885015], [1407.0, 65.2689110556941], [1399.0, 64.88052516411373], [1383.0, 28.95564516129033], [1391.0, 60.618406693342955], [1423.0, 63.699808795411165], [1415.0, 8.599999999999998], [1439.0, 66.734375], [1431.0, 20.425000000000008], [1471.0, 58.104127928598025], [1463.0, 66.0], [1447.0, 54.73206568712188], [1455.0, 43.608326908249815], [1487.0, 57.48636009353078], [1479.0, 80.35546651402413], [1503.0, 64.46259302781041], [1495.0, 70.53333333333329], [1535.0, 75.66666666666667], [1527.0, 25.72173913043479], [1511.0, 55.04181184668996], [1519.0, 59.472989949748744], [1567.0, 69.52663622526643], [1559.0, 64.40303358613218], [1543.0, 68.0], [1599.0, 23.16688061617456], [1591.0, 65.4160942100098], [1575.0, 73.16164154103849], [1583.0, 60.91136363636364], [1607.0, 44.70703125000002], [1623.0, 86.85918003565057], [1615.0, 69.99301513387654], [1655.0, 70.89062500000001], [1663.0, 67.57778685177621], [1631.0, 61.85872470408556], [1639.0, 86.82003395585744], [1647.0, 70.28571428571425], [1671.0, 58.526243093922645], [1679.0, 84.93598103141657], [1687.0, 87.8682322243965], [1695.0, 54.22680412371137], [1727.0, 327.0], [1719.0, 70.83393113342896], [1703.0, 59.53721444362568], [1711.0, 68.32813975448543], [1735.0, 61.15173410404621], [1743.0, 51.05816554809842], [1751.0, 67.46199095022632], [1759.0, 53.385714285714265], [1791.0, 66.522971360382], [1783.0, 84.32565899232571], [1767.0, 66.5994225911223], [1775.0, 68.65129682997134], [1799.0, 48.04715447154473], [1807.0, 89.10269709543552], [1815.0, 114.58784893267655], [1823.0, 65.40339425587469], [1855.0, 99.97134004647553], [1847.0, 104.96266397578198], [1831.0, 75.91835980790557], [1839.0, 111.04639684106607], [1863.0, 90.75801980197998], [1871.0, 75.49773755656129], [1879.0, 162.7586206896552], [1887.0, 94.75423395037407], [1919.0, 50.33248081841434], [1911.0, 78.17136038186152], [1895.0, 6.510638297872341], [1903.0, 82.51524806554391], [1927.0, 84.85919682697077], [1935.0, 67.51521298174457], [1943.0, 85.86936170212752], [1951.0, 74.82169443459757], [1983.0, 84.8550819672131], [1975.0, 87.7572840790845], [1967.0, 119.54482758620688], [1991.0, 102.49568552253128], [1999.0, 87.50645756457557], [2007.0, 82.07802093244527], [2015.0, 67.25784753363233], [2047.0, 91.79036827195465], [2039.0, 210.64285714285714], [2023.0, 79.61205957137678], [2031.0, 92.81136950904393], [2062.0, 71.18688118811895], [2078.0, 58.422916666666694], [2094.0, 76.3108695652174], [2110.0, 91.77566539923951], [2174.0, 125.25917431192653], [2158.0, 83.67330016583743], [2126.0, 86.8578305519898], [2286.0, 79.62373737373734], [2190.0, 115.23731343283585], [2302.0, 78.68916949975706], [2222.0, 86.46426271732139], [2238.0, 106.70463173880022], [2254.0, 100.89186134137172], [2270.0, 97.73938942665673], [2334.0, 116.97635726795107], [2318.0, 112.88557614826746], [2414.0, 63.2145454545454], [2430.0, 99.33930416810189], [2350.0, 138.68376068376062], [2366.0, 121.04462934947038], [2382.0, 100.92669924478014], [2398.0, 101.753663003663], [2446.0, 10.534090909090907], [2462.0, 90.20441347270605], [2478.0, 68.62790697674419], [2494.0, 70.87763713080177], [2558.0, 126.53469079939651], [2542.0, 42.379254457050294], [2510.0, 121.39105748757973], [2526.0, 81.30028328611918], [2590.0, 125.19298245614034], [2574.0, 116.82341796134938], [2670.0, 147.5102040816326], [2686.0, 113.48596321394014], [2606.0, 114.80893782383411], [2638.0, 123.98769574944075], [2654.0, 116.0461630695443], [2702.0, 160.1623169955446], [2718.0, 174.66666666666666], [2798.0, 134.8328882106071], [2814.0, 126.22701259061425], [2734.0, 130.8226977455102], [2750.0, 123.3443306788016], [2926.0, 139.1637134052386], [2830.0, 142.49651432997658], [2846.0, 367.3333333333333], [2942.0, 160.89341377576676], [2862.0, 148.72320740169616], [2878.0, 123.10238907849835], [2894.0, 138.94776119403], [2910.0, 131.64637904468378], [3054.0, 209.3005464480875], [2974.0, 156.23281853281838], [3070.0, 158.98961424332344], [2990.0, 128.13060278207107], [3006.0, 128.56799615569457], [3022.0, 207.9047619047619], [3038.0, 153.7236024844725], [3086.0, 182.36257309941513], [3182.0, 140.84853090172243], [3198.0, 170.63636363636365], [3118.0, 159.72939677145308], [3150.0, 161.22828204129357], [3166.0, 137.5368134008571], [3102.0, 208.0], [3214.0, 51.91627906976747], [3230.0, 140.98293963254577], [3246.0, 156.50814584949583], [3262.0, 156.28571428571428], [3326.0, 145.5877923107411], [3310.0, 165.57922769640493], [3278.0, 119.86792452830196], [3294.0, 147.9097276264594], [3342.0, 154.49267540477987], [3358.0, 144.52457727094], [3374.0, 157.2606689734717], [3390.0, 140.30537883169438], [3406.0, 159.3802003081664], [3422.0, 190.7344514325647], [3438.0, 183.6037023044955], [3454.0, 171.23802103622936], [3470.0, 147.42193598750978], [3486.0, 185.8912133891214], [3502.0, 152.62707182320463], [3534.0, 102.66063138347276], [3550.0, 125.40188679245279], [3566.0, 142.55555555555554], [3582.0, 234.00146341463457], [3614.0, 202.98128342245988], [3646.0, 273.6795454545454], [3662.0, 158.1951006124236], [3678.0, 117.36073059360731], [3710.0, 194.17120622568086], [3694.0, 407.7142857142857], [3630.0, 406.5], [3598.0, 410.0], [3726.0, 134.54021244309567], [3742.0, 249.95551894563414], [3758.0, 172.93282442748122], [3774.0, 236.71902834008122], [3806.0, 158.52204030226704], [3838.0, 92.55861555638263], [3854.0, 161.01127049180363], [3886.0, 142.973950795948], [3902.0, 151.42123893805322], [3918.0, 386.0], [3934.0, 139.01608579088438], [3950.0, 110.98964497041428], [3966.0, 174.09650455927064], [3982.0, 86.46949602122021], [3998.0, 168.05684547638126], [4014.0, 83.21907060953522], [4030.0, 270.62260127931773], [4046.0, 181.03078137332298], [4124.0, 267.16079999999954], [4220.0, 178.42365771812126], [4284.0, 239.21284403669705], [4316.0, 329.0], [4348.0, 388.0], [4476.0, 90.49746192893406], [4508.0, 241.02631578947344], [4540.0, 290.004897595726], [4572.0, 283.8726912928756], [4604.0, 267.2526475037823], [4444.0, 380.5], [4412.0, 384.0], [4636.0, 178.80724876441508], [4668.0, 156.1826923076924], [4700.0, 384.7368421052634], [4732.0, 188.92854226214794], [4764.0, 347.1202898550723], [4796.0, 194.88917861799203], [4828.0, 162.48949211908962], [4860.0, 217.79552889858192], [4924.0, 238.52557041699473], [4956.0, 268.16381953569913], [4988.0, 218.98785578747555], [4892.0, 207.25], [4157.0, 208.5390530149741], [4189.0, 138.12279355333877], [4221.0, 123.85975609756102], [4253.0, 158.50806451612877], [4285.0, 274.252066115702], [4317.0, 219.76009995835096], [4349.0, 165.07790601813713], [4381.0, 170.08346273291903], [4413.0, 241.0658899156291], [4445.0, 86.60427413411942], [4541.0, 224.477902621723], [4573.0, 252.09963099631003], [4605.0, 206.49346120313834], [4637.0, 128.5973451327433], [4669.0, 236.4307133121307], [4701.0, 123.01630276564784], [4765.0, 74.35147392290239], [4797.0, 242.72278338945011], [4829.0, 103.65193370165746], [4861.0, 273.6666666666667], [4733.0, 219.0], [4893.0, 222.86167711598733], [4925.0, 128.20000000000002], [4957.0, 326.8808864265927], [4989.0, 175.43205287071473], [2063.0, 115.02635046113319], [2079.0, 78.90573152337876], [2095.0, 89.96162427487721], [2111.0, 37.45423728813561], [2175.0, 68.61592505854797], [2159.0, 68.25827814569504], [2127.0, 78.76806083650186], [2143.0, 84.12713068181806], [2191.0, 93.68597104343486], [2207.0, 105.26295585412655], [2223.0, 102.28656462585026], [2303.0, 104.06470106470104], [2287.0, 98.87067571936616], [2255.0, 195.0], [2271.0, 101.33899584748939], [2319.0, 65.20312499999996], [2335.0, 138.5947136563875], [2351.0, 101.52378964941568], [2367.0, 116.33666377063419], [2431.0, 121.48484848484843], [2415.0, 102.31211692597806], [2383.0, 101.73628048780492], [2399.0, 87.042253521127], [2447.0, 95.15714285714286], [2463.0, 94.59480269489872], [2479.0, 81.90322580645177], [2495.0, 44.69382022471911], [2543.0, 64.05092592592585], [2511.0, 103.88461538461523], [2527.0, 140.85529506871478], [2671.0, 120.5517100977196], [2591.0, 113.94362017804161], [2687.0, 114.17564402810306], [2607.0, 110.37042001787313], [2623.0, 114.76434583014526], [2639.0, 153.4051575931227], [2655.0, 146.9854791868346], [2719.0, 128.504344391785], [2703.0, 97.94561933534744], [2767.0, 125.83746661579553], [2799.0, 132.66042780748657], [2783.0, 121.71049640015163], [2847.0, 132.90191657271708], [2943.0, 120.92394122731193], [2863.0, 142.23996265172732], [2879.0, 140.38142076502731], [2895.0, 124.32258064516128], [2911.0, 269.3], [2927.0, 365.0], [2831.0, 368.0], [2959.0, 136.08320726172437], [2975.0, 142.02191464821192], [2991.0, 128.32174392935994], [3007.0, 223.52816901408454], [3071.0, 145.8388773388774], [3055.0, 136.23159193747426], [3023.0, 125.00172711571666], [3039.0, 112.66777408637877], [3087.0, 192.48424068767895], [3103.0, 139.13882443928827], [3119.0, 117.04347826086956], [3135.0, 143.9233962264151], [3199.0, 136.89965129794663], [3183.0, 148.80225988700548], [3151.0, 221.75], [3167.0, 161.26713008937452], [3215.0, 177.11268603827025], [3231.0, 148.16964285714278], [3247.0, 153.68181818181768], [3279.0, 146.24136562127805], [3311.0, 151.9253333333331], [3295.0, 211.0], [3263.0, 212.33333333333334], [3375.0, 168.07400379506623], [3423.0, 145.13620071684582], [3439.0, 169.5], [3455.0, 411.8571428571429], [3359.0, 210.5], [3487.0, 109.84158415841586], [3503.0, 68.9072681704261], [3519.0, 79.18908024917573], [3535.0, 65.36900369003698], [3551.0, 159.2163442558228], [3583.0, 158.67497034400958], [3471.0, 411.0], [3599.0, 160.80617977528073], [3615.0, 171.73884452794698], [3631.0, 257.43284789644036], [3647.0, 215.33376040999346], [3679.0, 175.7996070726914], [3695.0, 239.403361344538], [3711.0, 166.00609080841633], [3663.0, 408.2], [3727.0, 99.16253164556973], [3743.0, 232.75], [3759.0, 160.76526082130928], [3775.0, 136.35469613259656], [3791.0, 176.70413961038963], [3807.0, 150.02637614678892], [3823.0, 269.63759213759187], [3839.0, 402.5], [3855.0, 114.34325108853403], [3871.0, 247.09968725566864], [3887.0, 96.06655290102395], [3903.0, 229.60000000000002], [3919.0, 129.45560571858533], [3935.0, 96.85254691689016], [3951.0, 267.0061349693251], [3967.0, 114.06455142231944], [3983.0, 184.2486213235293], [4031.0, 263.391918208374], [4047.0, 162.4], [4063.0, 222.9679334916867], [4079.0, 226.60201511334998], [4095.0, 285.49163498098903], [4126.0, 100.6811918063313], [4158.0, 185.9682034976155], [4190.0, 201.91468005018805], [4222.0, 325.1948497854073], [4286.0, 90.24234527687305], [4318.0, 142.6526703499076], [4254.0, 391.4285714285714], [4382.0, 188.8811188811187], [4414.0, 207.93749999999977], [4446.0, 264.99823425544446], [4478.0, 326.58273075287116], [4510.0, 139.08749229821356], [4542.0, 59.04446091144861], [4574.0, 155.69692923898518], [4606.0, 83.15649606299202], [4638.0, 267.72256532066444], [4670.0, 211.25921658986158], [4702.0, 246.74069235793587], [4734.0, 214.38028169014103], [4766.0, 179.68349445041218], [4798.0, 272.7037593984965], [4830.0, 173.16853932584277], [4862.0, 192.90689785148888], [4926.0, 192.55067155067172], [4958.0, 107.44821826280617], [4990.0, 280.42485207100583], [4127.0, 221.3732449297976], [4191.0, 240.1963226571768], [4255.0, 126.70122176971492], [4287.0, 227.3145029875072], [4351.0, 113.33593750000021], [4319.0, 389.0], [4223.0, 393.0], [4383.0, 223.38316831683153], [4415.0, 116.17454954954954], [4447.0, 258.5036057692306], [4479.0, 156.84447605500242], [4511.0, 333.8797399783317], [4575.0, 180.51239669421489], [4607.0, 247.68747309513572], [4639.0, 398.315789473684], [4671.0, 189.76814159292036], [4703.0, 417.18181818181824], [4767.0, 221.00993377483468], [4799.0, 100.06944444444441], [4831.0, 242.04086317722658], [4863.0, 181.4121779859484], [4895.0, 215.80056292722145], [4991.0, 254.03202416918347], [4927.0, 207.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[3750.149624845138, 163.0625245220631]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 5000.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 48939.78333333333, "minX": 1.53080478E12, "maxY": 2.262725065E7, "series": [{"data": [[1.53080502E12, 2.0559791083333332E7], [1.53080484E12, 2.262725065E7], [1.53080532E12, 2.252561725E7], [1.53080514E12, 2.1883302066666666E7], [1.53080496E12, 2.128135955E7], [1.53080478E12, 288807.6], [1.53080526E12, 2.2052322866666667E7], [1.53080508E12, 2.1613125416666668E7], [1.5308049E12, 2.26260462E7], [1.53080538E12, 2.1099796333333332E7], [1.5308052E12, 2.24641374E7]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.53080502E12, 3498893.283333333], [1.53080484E12, 3834351.716666667], [1.53080532E12, 3817312.566666667], [1.53080514E12, 3708258.533333333], [1.53080496E12, 3635149.5833333335], [1.53080478E12, 48939.78333333333], [1.53080526E12, 3736899.8833333333], [1.53080508E12, 3666313.433333333], [1.5308049E12, 3838290.933333333], [1.53080538E12, 3575488.8666666667], [1.5308052E12, 3806971.033333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53080538E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 1.8789032329250839, "minX": 1.53080478E12, "maxY": 218.6538264911201, "series": [{"data": [[1.53080502E12, 163.61338503385628], [1.53080484E12, 22.385254651665914], [1.53080532E12, 212.02463114116665], [1.53080514E12, 217.91581363142615], [1.53080496E12, 111.27426278795427], [1.53080478E12, 1.8789032329250839], [1.53080526E12, 216.72562944487524], [1.53080508E12, 200.17015720494308], [1.5308049E12, 63.83213890788221], [1.53080538E12, 218.6538264911201], [1.5308052E12, 212.66967992681552]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53080538E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 1.8746000220677468, "minX": 1.53080478E12, "maxY": 218.65038229041755, "series": [{"data": [[1.53080502E12, 163.6080722264037], [1.53080484E12, 22.382910509978377], [1.53080532E12, 212.0205478773844], [1.53080514E12, 217.91161173966591], [1.53080496E12, 111.26884770325182], [1.53080478E12, 1.8746000220677468], [1.53080526E12, 216.7218029575751], [1.53080508E12, 200.16637712836362], [1.5308049E12, 63.828944628741674], [1.53080538E12, 218.65038229041755], [1.5308052E12, 212.66584869395436]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53080538E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.00976103697110738, "minX": 1.53080478E12, "maxY": 2.4494995437260654, "series": [{"data": [[1.53080502E12, 0.9881721550243863], [1.53080484E12, 0.00976103697110738], [1.53080532E12, 2.226048577612374], [1.53080514E12, 2.2650977953720624], [1.53080496E12, 0.5063880322989052], [1.53080478E12, 0.030674169700981975], [1.53080526E12, 2.4494995437260654], [1.53080508E12, 1.9145075259094513], [1.5308049E12, 0.03800847493394847], [1.53080538E12, 2.2041902805729574], [1.5308052E12, 2.015233441371999]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53080538E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 0.0, "minX": 1.53080478E12, "maxY": 5129.0, "series": [{"data": [[1.53080502E12, 2209.0], [1.53080484E12, 318.0], [1.53080532E12, 4104.0], [1.53080514E12, 3248.0], [1.53080496E12, 1845.0], [1.53080478E12, 105.0], [1.53080526E12, 4517.0], [1.53080508E12, 3085.0], [1.5308049E12, 433.0], [1.53080538E12, 3263.0], [1.5308052E12, 5129.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.53080502E12, 0.0], [1.53080484E12, 0.0], [1.53080532E12, 0.0], [1.53080514E12, 0.0], [1.53080496E12, 0.0], [1.53080478E12, 0.0], [1.53080526E12, 0.0], [1.53080508E12, 0.0], [1.5308049E12, 0.0], [1.53080538E12, 0.0], [1.5308052E12, 0.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.53080502E12, 352.0], [1.53080484E12, 110.0], [1.53080532E12, 436.0], [1.53080514E12, 814.0], [1.53080496E12, 237.0], [1.53080478E12, 2.0], [1.53080526E12, 808.0], [1.53080508E12, 421.0], [1.5308049E12, 125.0], [1.53080538E12, 428.0], [1.5308052E12, 799.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.53080502E12, 461.0], [1.53080484E12, 209.0], [1.53080532E12, 781.0], [1.53080514E12, 967.0], [1.53080496E12, 288.0], [1.53080478E12, 11.459999999999127], [1.53080526E12, 956.0], [1.53080508E12, 448.0], [1.5308049E12, 204.0], [1.53080538E12, 454.0], [1.5308052E12, 941.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.53080502E12, 358.0], [1.53080484E12, 176.0], [1.53080532E12, 439.0], [1.53080514E12, 889.0], [1.53080496E12, 255.0], [1.53080478E12, 2.0], [1.53080526E12, 892.0], [1.53080508E12, 426.0], [1.5308049E12, 198.0], [1.53080538E12, 440.0], [1.5308052E12, 878.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53080538E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 1.0, "minX": 302.0, "maxY": 363.0, "series": [{"data": [[302.0, 1.0], [22440.0, 145.0], [21598.0, 227.0], [22070.0, 214.0], [22631.0, 201.0], [22890.0, 4.0], [23499.0, 4.0], [23067.0, 3.0], [23668.0, 14.0], [23693.0, 88.0], [23563.0, 210.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[22440.0, 104.0], [21598.0, 137.0], [22631.0, 243.0], [23499.0, 363.0], [23668.0, 9.0], [23693.0, 87.0], [23563.0, 116.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 23693.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 1.0, "minX": 302.0, "maxY": 363.0, "series": [{"data": [[302.0, 1.0], [22440.0, 145.0], [21598.0, 227.0], [22070.0, 214.0], [22631.0, 201.0], [22890.0, 4.0], [23499.0, 4.0], [23067.0, 3.0], [23668.0, 14.0], [23693.0, 88.0], [23563.0, 210.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[22440.0, 104.0], [21598.0, 137.0], [22631.0, 243.0], [23499.0, 363.0], [23668.0, 9.0], [23693.0, 87.0], [23563.0, 116.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 23693.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 302.1, "minX": 1.53080478E12, "maxY": 23693.4, "series": [{"data": [[1.53080502E12, 21598.85], [1.53080484E12, 23668.933333333334], [1.53080532E12, 23541.266666666666], [1.53080514E12, 22911.166666666668], [1.53080496E12, 22440.416666666668], [1.53080478E12, 302.1], [1.53080526E12, 23074.816666666666], [1.53080508E12, 22631.8], [1.5308049E12, 23693.4], [1.53080538E12, 22068.95], [1.5308052E12, 23495.883333333335]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53080538E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.2833333333333333, "minX": 1.53080478E12, "maxY": 23668.65, "series": [{"data": [[1.53080502E12, 21498.166666666668], [1.53080484E12, 23668.65], [1.53080532E12, 23562.25], [1.53080514E12, 22890.483333333334], [1.53080496E12, 22245.55], [1.53080478E12, 302.1], [1.53080526E12, 23067.283333333333], [1.53080508E12, 22605.833333333332], [1.5308049E12, 23665.2], [1.53080538E12, 22070.916666666668], [1.5308052E12, 23497.9]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.53080502E12, 100.58333333333333], [1.53080484E12, 0.2833333333333333], [1.53080532E12, 1.4166666666666667], [1.53080496E12, 194.85], [1.53080508E12, 25.983333333333334], [1.5308049E12, 28.2], [1.5308052E12, 1.9333333333333333]], "isOverall": false, "label": "504", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53080538E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.2833333333333333, "minX": 1.53080478E12, "maxY": 23668.65, "series": [{"data": [[1.53080502E12, 21498.166666666668], [1.53080484E12, 23668.65], [1.53080532E12, 23562.25], [1.53080514E12, 22890.483333333334], [1.53080496E12, 22245.55], [1.53080478E12, 302.1], [1.53080526E12, 23067.283333333333], [1.53080508E12, 22605.833333333332], [1.5308049E12, 23665.2], [1.53080538E12, 22070.916666666668], [1.5308052E12, 23497.9]], "isOverall": false, "label": "HTTP Request-success", "isController": false}, {"data": [[1.53080502E12, 100.58333333333333], [1.53080484E12, 0.2833333333333333], [1.53080532E12, 1.4166666666666667], [1.53080496E12, 194.85], [1.53080508E12, 25.983333333333334], [1.5308049E12, 28.2], [1.5308052E12, 1.9333333333333333]], "isOverall": false, "label": "HTTP Request-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53080538E12, "title": "Transactions Per Second"}},
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
