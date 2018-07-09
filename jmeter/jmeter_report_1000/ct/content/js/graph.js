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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 6433.0, "series": [{"data": [[0.0, 1.0], [0.1, 1.0], [0.2, 1.0], [0.3, 2.0], [0.4, 2.0], [0.5, 2.0], [0.6, 2.0], [0.7, 2.0], [0.8, 2.0], [0.9, 2.0], [1.0, 2.0], [1.1, 2.0], [1.2, 2.0], [1.3, 2.0], [1.4, 2.0], [1.5, 3.0], [1.6, 3.0], [1.7, 3.0], [1.8, 3.0], [1.9, 3.0], [2.0, 3.0], [2.1, 3.0], [2.2, 3.0], [2.3, 3.0], [2.4, 3.0], [2.5, 3.0], [2.6, 3.0], [2.7, 3.0], [2.8, 4.0], [2.9, 4.0], [3.0, 4.0], [3.1, 4.0], [3.2, 4.0], [3.3, 4.0], [3.4, 4.0], [3.5, 4.0], [3.6, 4.0], [3.7, 4.0], [3.8, 4.0], [3.9, 4.0], [4.0, 4.0], [4.1, 4.0], [4.2, 5.0], [4.3, 5.0], [4.4, 5.0], [4.5, 5.0], [4.6, 5.0], [4.7, 5.0], [4.8, 5.0], [4.9, 5.0], [5.0, 5.0], [5.1, 5.0], [5.2, 5.0], [5.3, 5.0], [5.4, 5.0], [5.5, 5.0], [5.6, 5.0], [5.7, 5.0], [5.8, 5.0], [5.9, 5.0], [6.0, 6.0], [6.1, 6.0], [6.2, 6.0], [6.3, 6.0], [6.4, 6.0], [6.5, 6.0], [6.6, 6.0], [6.7, 6.0], [6.8, 6.0], [6.9, 6.0], [7.0, 6.0], [7.1, 6.0], [7.2, 6.0], [7.3, 6.0], [7.4, 6.0], [7.5, 7.0], [7.6, 7.0], [7.7, 7.0], [7.8, 7.0], [7.9, 7.0], [8.0, 7.0], [8.1, 7.0], [8.2, 7.0], [8.3, 7.0], [8.4, 7.0], [8.5, 7.0], [8.6, 8.0], [8.7, 8.0], [8.8, 8.0], [8.9, 8.0], [9.0, 8.0], [9.1, 8.0], [9.2, 8.0], [9.3, 8.0], [9.4, 8.0], [9.5, 8.0], [9.6, 8.0], [9.7, 9.0], [9.8, 9.0], [9.9, 9.0], [10.0, 9.0], [10.1, 9.0], [10.2, 9.0], [10.3, 9.0], [10.4, 9.0], [10.5, 9.0], [10.6, 9.0], [10.7, 10.0], [10.8, 10.0], [10.9, 10.0], [11.0, 10.0], [11.1, 10.0], [11.2, 10.0], [11.3, 10.0], [11.4, 10.0], [11.5, 10.0], [11.6, 10.0], [11.7, 11.0], [11.8, 11.0], [11.9, 11.0], [12.0, 11.0], [12.1, 11.0], [12.2, 11.0], [12.3, 11.0], [12.4, 11.0], [12.5, 11.0], [12.6, 11.0], [12.7, 11.0], [12.8, 11.0], [12.9, 11.0], [13.0, 12.0], [13.1, 12.0], [13.2, 12.0], [13.3, 12.0], [13.4, 12.0], [13.5, 12.0], [13.6, 12.0], [13.7, 12.0], [13.8, 12.0], [13.9, 12.0], [14.0, 12.0], [14.1, 12.0], [14.2, 12.0], [14.3, 12.0], [14.4, 12.0], [14.5, 12.0], [14.6, 13.0], [14.7, 13.0], [14.8, 13.0], [14.9, 13.0], [15.0, 13.0], [15.1, 13.0], [15.2, 13.0], [15.3, 13.0], [15.4, 13.0], [15.5, 13.0], [15.6, 13.0], [15.7, 13.0], [15.8, 13.0], [15.9, 13.0], [16.0, 13.0], [16.1, 14.0], [16.2, 14.0], [16.3, 14.0], [16.4, 14.0], [16.5, 14.0], [16.6, 14.0], [16.7, 14.0], [16.8, 14.0], [16.9, 14.0], [17.0, 14.0], [17.1, 14.0], [17.2, 14.0], [17.3, 14.0], [17.4, 14.0], [17.5, 14.0], [17.6, 14.0], [17.7, 14.0], [17.8, 14.0], [17.9, 15.0], [18.0, 15.0], [18.1, 15.0], [18.2, 15.0], [18.3, 15.0], [18.4, 15.0], [18.5, 15.0], [18.6, 15.0], [18.7, 15.0], [18.8, 15.0], [18.9, 15.0], [19.0, 15.0], [19.1, 15.0], [19.2, 15.0], [19.3, 15.0], [19.4, 15.0], [19.5, 15.0], [19.6, 15.0], [19.7, 16.0], [19.8, 16.0], [19.9, 16.0], [20.0, 16.0], [20.1, 16.0], [20.2, 16.0], [20.3, 16.0], [20.4, 16.0], [20.5, 16.0], [20.6, 16.0], [20.7, 16.0], [20.8, 16.0], [20.9, 16.0], [21.0, 16.0], [21.1, 16.0], [21.2, 16.0], [21.3, 17.0], [21.4, 17.0], [21.5, 17.0], [21.6, 17.0], [21.7, 17.0], [21.8, 17.0], [21.9, 17.0], [22.0, 17.0], [22.1, 17.0], [22.2, 17.0], [22.3, 17.0], [22.4, 17.0], [22.5, 17.0], [22.6, 17.0], [22.7, 17.0], [22.8, 18.0], [22.9, 18.0], [23.0, 18.0], [23.1, 18.0], [23.2, 18.0], [23.3, 18.0], [23.4, 18.0], [23.5, 18.0], [23.6, 18.0], [23.7, 18.0], [23.8, 18.0], [23.9, 18.0], [24.0, 18.0], [24.1, 18.0], [24.2, 18.0], [24.3, 18.0], [24.4, 19.0], [24.5, 19.0], [24.6, 19.0], [24.7, 19.0], [24.8, 19.0], [24.9, 19.0], [25.0, 19.0], [25.1, 19.0], [25.2, 19.0], [25.3, 19.0], [25.4, 19.0], [25.5, 19.0], [25.6, 19.0], [25.7, 20.0], [25.8, 20.0], [25.9, 20.0], [26.0, 20.0], [26.1, 20.0], [26.2, 20.0], [26.3, 20.0], [26.4, 20.0], [26.5, 20.0], [26.6, 20.0], [26.7, 20.0], [26.8, 20.0], [26.9, 20.0], [27.0, 21.0], [27.1, 21.0], [27.2, 21.0], [27.3, 21.0], [27.4, 21.0], [27.5, 21.0], [27.6, 21.0], [27.7, 21.0], [27.8, 21.0], [27.9, 21.0], [28.0, 21.0], [28.1, 21.0], [28.2, 21.0], [28.3, 22.0], [28.4, 22.0], [28.5, 22.0], [28.6, 22.0], [28.7, 22.0], [28.8, 22.0], [28.9, 22.0], [29.0, 22.0], [29.1, 22.0], [29.2, 22.0], [29.3, 22.0], [29.4, 22.0], [29.5, 23.0], [29.6, 23.0], [29.7, 23.0], [29.8, 23.0], [29.9, 23.0], [30.0, 23.0], [30.1, 23.0], [30.2, 23.0], [30.3, 23.0], [30.4, 23.0], [30.5, 23.0], [30.6, 24.0], [30.7, 24.0], [30.8, 24.0], [30.9, 24.0], [31.0, 24.0], [31.1, 24.0], [31.2, 24.0], [31.3, 24.0], [31.4, 24.0], [31.5, 24.0], [31.6, 25.0], [31.7, 25.0], [31.8, 25.0], [31.9, 25.0], [32.0, 25.0], [32.1, 25.0], [32.2, 25.0], [32.3, 25.0], [32.4, 25.0], [32.5, 25.0], [32.6, 25.0], [32.7, 26.0], [32.8, 26.0], [32.9, 26.0], [33.0, 26.0], [33.1, 26.0], [33.2, 26.0], [33.3, 26.0], [33.4, 26.0], [33.5, 26.0], [33.6, 26.0], [33.7, 26.0], [33.8, 27.0], [33.9, 27.0], [34.0, 27.0], [34.1, 27.0], [34.2, 27.0], [34.3, 27.0], [34.4, 27.0], [34.5, 27.0], [34.6, 27.0], [34.7, 27.0], [34.8, 28.0], [34.9, 28.0], [35.0, 28.0], [35.1, 28.0], [35.2, 28.0], [35.3, 28.0], [35.4, 28.0], [35.5, 28.0], [35.6, 28.0], [35.7, 28.0], [35.8, 28.0], [35.9, 29.0], [36.0, 29.0], [36.1, 29.0], [36.2, 29.0], [36.3, 29.0], [36.4, 29.0], [36.5, 29.0], [36.6, 29.0], [36.7, 29.0], [36.8, 29.0], [36.9, 29.0], [37.0, 30.0], [37.1, 30.0], [37.2, 30.0], [37.3, 30.0], [37.4, 30.0], [37.5, 30.0], [37.6, 30.0], [37.7, 30.0], [37.8, 30.0], [37.9, 30.0], [38.0, 30.0], [38.1, 31.0], [38.2, 31.0], [38.3, 31.0], [38.4, 31.0], [38.5, 31.0], [38.6, 31.0], [38.7, 31.0], [38.8, 31.0], [38.9, 31.0], [39.0, 31.0], [39.1, 31.0], [39.2, 31.0], [39.3, 32.0], [39.4, 32.0], [39.5, 32.0], [39.6, 32.0], [39.7, 32.0], [39.8, 32.0], [39.9, 32.0], [40.0, 32.0], [40.1, 32.0], [40.2, 32.0], [40.3, 32.0], [40.4, 32.0], [40.5, 33.0], [40.6, 33.0], [40.7, 33.0], [40.8, 33.0], [40.9, 33.0], [41.0, 33.0], [41.1, 33.0], [41.2, 33.0], [41.3, 33.0], [41.4, 33.0], [41.5, 33.0], [41.6, 33.0], [41.7, 33.0], [41.8, 34.0], [41.9, 34.0], [42.0, 34.0], [42.1, 34.0], [42.2, 34.0], [42.3, 34.0], [42.4, 34.0], [42.5, 34.0], [42.6, 34.0], [42.7, 34.0], [42.8, 34.0], [42.9, 34.0], [43.0, 34.0], [43.1, 34.0], [43.2, 35.0], [43.3, 35.0], [43.4, 35.0], [43.5, 35.0], [43.6, 35.0], [43.7, 35.0], [43.8, 35.0], [43.9, 35.0], [44.0, 35.0], [44.1, 35.0], [44.2, 35.0], [44.3, 35.0], [44.4, 35.0], [44.5, 35.0], [44.6, 36.0], [44.7, 36.0], [44.8, 36.0], [44.9, 36.0], [45.0, 36.0], [45.1, 36.0], [45.2, 36.0], [45.3, 36.0], [45.4, 36.0], [45.5, 36.0], [45.6, 36.0], [45.7, 36.0], [45.8, 36.0], [45.9, 36.0], [46.0, 37.0], [46.1, 37.0], [46.2, 37.0], [46.3, 37.0], [46.4, 37.0], [46.5, 37.0], [46.6, 37.0], [46.7, 37.0], [46.8, 37.0], [46.9, 37.0], [47.0, 37.0], [47.1, 37.0], [47.2, 37.0], [47.3, 38.0], [47.4, 38.0], [47.5, 38.0], [47.6, 38.0], [47.7, 38.0], [47.8, 38.0], [47.9, 38.0], [48.0, 38.0], [48.1, 38.0], [48.2, 38.0], [48.3, 38.0], [48.4, 38.0], [48.5, 38.0], [48.6, 38.0], [48.7, 39.0], [48.8, 39.0], [48.9, 39.0], [49.0, 39.0], [49.1, 39.0], [49.2, 39.0], [49.3, 39.0], [49.4, 39.0], [49.5, 39.0], [49.6, 39.0], [49.7, 39.0], [49.8, 39.0], [49.9, 39.0], [50.0, 39.0], [50.1, 39.0], [50.2, 40.0], [50.3, 40.0], [50.4, 40.0], [50.5, 40.0], [50.6, 40.0], [50.7, 40.0], [50.8, 40.0], [50.9, 40.0], [51.0, 40.0], [51.1, 40.0], [51.2, 40.0], [51.3, 40.0], [51.4, 40.0], [51.5, 40.0], [51.6, 41.0], [51.7, 41.0], [51.8, 41.0], [51.9, 41.0], [52.0, 41.0], [52.1, 41.0], [52.2, 41.0], [52.3, 41.0], [52.4, 41.0], [52.5, 41.0], [52.6, 41.0], [52.7, 41.0], [52.8, 41.0], [52.9, 41.0], [53.0, 42.0], [53.1, 42.0], [53.2, 42.0], [53.3, 42.0], [53.4, 42.0], [53.5, 42.0], [53.6, 42.0], [53.7, 42.0], [53.8, 42.0], [53.9, 42.0], [54.0, 42.0], [54.1, 42.0], [54.2, 42.0], [54.3, 42.0], [54.4, 43.0], [54.5, 43.0], [54.6, 43.0], [54.7, 43.0], [54.8, 43.0], [54.9, 43.0], [55.0, 43.0], [55.1, 43.0], [55.2, 43.0], [55.3, 43.0], [55.4, 43.0], [55.5, 43.0], [55.6, 43.0], [55.7, 43.0], [55.8, 43.0], [55.9, 44.0], [56.0, 44.0], [56.1, 44.0], [56.2, 44.0], [56.3, 44.0], [56.4, 44.0], [56.5, 44.0], [56.6, 44.0], [56.7, 44.0], [56.8, 44.0], [56.9, 44.0], [57.0, 44.0], [57.1, 44.0], [57.2, 44.0], [57.3, 45.0], [57.4, 45.0], [57.5, 45.0], [57.6, 45.0], [57.7, 45.0], [57.8, 45.0], [57.9, 45.0], [58.0, 45.0], [58.1, 45.0], [58.2, 45.0], [58.3, 45.0], [58.4, 45.0], [58.5, 45.0], [58.6, 45.0], [58.7, 46.0], [58.8, 46.0], [58.9, 46.0], [59.0, 46.0], [59.1, 46.0], [59.2, 46.0], [59.3, 46.0], [59.4, 46.0], [59.5, 46.0], [59.6, 46.0], [59.7, 46.0], [59.8, 46.0], [59.9, 46.0], [60.0, 46.0], [60.1, 47.0], [60.2, 47.0], [60.3, 47.0], [60.4, 47.0], [60.5, 47.0], [60.6, 47.0], [60.7, 47.0], [60.8, 47.0], [60.9, 47.0], [61.0, 47.0], [61.1, 47.0], [61.2, 47.0], [61.3, 47.0], [61.4, 48.0], [61.5, 48.0], [61.6, 48.0], [61.7, 48.0], [61.8, 48.0], [61.9, 48.0], [62.0, 48.0], [62.1, 48.0], [62.2, 48.0], [62.3, 48.0], [62.4, 48.0], [62.5, 48.0], [62.6, 48.0], [62.7, 49.0], [62.8, 49.0], [62.9, 49.0], [63.0, 49.0], [63.1, 49.0], [63.2, 49.0], [63.3, 49.0], [63.4, 49.0], [63.5, 49.0], [63.6, 49.0], [63.7, 49.0], [63.8, 49.0], [63.9, 50.0], [64.0, 50.0], [64.1, 50.0], [64.2, 50.0], [64.3, 50.0], [64.4, 50.0], [64.5, 50.0], [64.6, 50.0], [64.7, 50.0], [64.8, 50.0], [64.9, 50.0], [65.0, 50.0], [65.1, 51.0], [65.2, 51.0], [65.3, 51.0], [65.4, 51.0], [65.5, 51.0], [65.6, 51.0], [65.7, 51.0], [65.8, 51.0], [65.9, 51.0], [66.0, 51.0], [66.1, 51.0], [66.2, 52.0], [66.3, 52.0], [66.4, 52.0], [66.5, 52.0], [66.6, 52.0], [66.7, 52.0], [66.8, 52.0], [66.9, 52.0], [67.0, 52.0], [67.1, 52.0], [67.2, 52.0], [67.3, 53.0], [67.4, 53.0], [67.5, 53.0], [67.6, 53.0], [67.7, 53.0], [67.8, 53.0], [67.9, 53.0], [68.0, 53.0], [68.1, 53.0], [68.2, 53.0], [68.3, 53.0], [68.4, 54.0], [68.5, 54.0], [68.6, 54.0], [68.7, 54.0], [68.8, 54.0], [68.9, 54.0], [69.0, 54.0], [69.1, 54.0], [69.2, 54.0], [69.3, 54.0], [69.4, 54.0], [69.5, 55.0], [69.6, 55.0], [69.7, 55.0], [69.8, 55.0], [69.9, 55.0], [70.0, 55.0], [70.1, 55.0], [70.2, 55.0], [70.3, 55.0], [70.4, 55.0], [70.5, 55.0], [70.6, 56.0], [70.7, 56.0], [70.8, 56.0], [70.9, 56.0], [71.0, 56.0], [71.1, 56.0], [71.2, 56.0], [71.3, 56.0], [71.4, 56.0], [71.5, 56.0], [71.6, 57.0], [71.7, 57.0], [71.8, 57.0], [71.9, 57.0], [72.0, 57.0], [72.1, 57.0], [72.2, 57.0], [72.3, 57.0], [72.4, 57.0], [72.5, 58.0], [72.6, 58.0], [72.7, 58.0], [72.8, 58.0], [72.9, 58.0], [73.0, 58.0], [73.1, 58.0], [73.2, 58.0], [73.3, 59.0], [73.4, 59.0], [73.5, 59.0], [73.6, 59.0], [73.7, 59.0], [73.8, 59.0], [73.9, 59.0], [74.0, 59.0], [74.1, 60.0], [74.2, 60.0], [74.3, 60.0], [74.4, 60.0], [74.5, 60.0], [74.6, 60.0], [74.7, 60.0], [74.8, 61.0], [74.9, 61.0], [75.0, 61.0], [75.1, 61.0], [75.2, 61.0], [75.3, 61.0], [75.4, 62.0], [75.5, 62.0], [75.6, 62.0], [75.7, 62.0], [75.8, 62.0], [75.9, 62.0], [76.0, 63.0], [76.1, 63.0], [76.2, 63.0], [76.3, 63.0], [76.4, 63.0], [76.5, 63.0], [76.6, 64.0], [76.7, 64.0], [76.8, 64.0], [76.9, 64.0], [77.0, 64.0], [77.1, 64.0], [77.2, 65.0], [77.3, 65.0], [77.4, 65.0], [77.5, 65.0], [77.6, 65.0], [77.7, 65.0], [77.8, 66.0], [77.9, 66.0], [78.0, 66.0], [78.1, 66.0], [78.2, 66.0], [78.3, 66.0], [78.4, 67.0], [78.5, 67.0], [78.6, 67.0], [78.7, 67.0], [78.8, 67.0], [78.9, 67.0], [79.0, 68.0], [79.1, 68.0], [79.2, 68.0], [79.3, 68.0], [79.4, 68.0], [79.5, 69.0], [79.6, 69.0], [79.7, 69.0], [79.8, 69.0], [79.9, 69.0], [80.0, 70.0], [80.1, 70.0], [80.2, 70.0], [80.3, 70.0], [80.4, 70.0], [80.5, 71.0], [80.6, 71.0], [80.7, 71.0], [80.8, 71.0], [80.9, 71.0], [81.0, 72.0], [81.1, 72.0], [81.2, 72.0], [81.3, 72.0], [81.4, 72.0], [81.5, 73.0], [81.6, 73.0], [81.7, 73.0], [81.8, 73.0], [81.9, 73.0], [82.0, 74.0], [82.1, 74.0], [82.2, 74.0], [82.3, 74.0], [82.4, 74.0], [82.5, 75.0], [82.6, 75.0], [82.7, 75.0], [82.8, 75.0], [82.9, 75.0], [83.0, 76.0], [83.1, 76.0], [83.2, 76.0], [83.3, 76.0], [83.4, 77.0], [83.5, 77.0], [83.6, 77.0], [83.7, 77.0], [83.8, 77.0], [83.9, 78.0], [84.0, 78.0], [84.1, 78.0], [84.2, 78.0], [84.3, 79.0], [84.4, 79.0], [84.5, 79.0], [84.6, 79.0], [84.7, 79.0], [84.8, 80.0], [84.9, 80.0], [85.0, 80.0], [85.1, 80.0], [85.2, 81.0], [85.3, 81.0], [85.4, 81.0], [85.5, 81.0], [85.6, 82.0], [85.7, 82.0], [85.8, 82.0], [85.9, 82.0], [86.0, 83.0], [86.1, 83.0], [86.2, 83.0], [86.3, 83.0], [86.4, 84.0], [86.5, 84.0], [86.6, 84.0], [86.7, 84.0], [86.8, 85.0], [86.9, 85.0], [87.0, 85.0], [87.1, 85.0], [87.2, 86.0], [87.3, 86.0], [87.4, 86.0], [87.5, 86.0], [87.6, 87.0], [87.7, 87.0], [87.8, 87.0], [87.9, 87.0], [88.0, 88.0], [88.1, 88.0], [88.2, 88.0], [88.3, 88.0], [88.4, 89.0], [88.5, 89.0], [88.6, 89.0], [88.7, 89.0], [88.8, 90.0], [88.9, 90.0], [89.0, 90.0], [89.1, 90.0], [89.2, 91.0], [89.3, 91.0], [89.4, 91.0], [89.5, 91.0], [89.6, 92.0], [89.7, 92.0], [89.8, 92.0], [89.9, 93.0], [90.0, 93.0], [90.1, 93.0], [90.2, 93.0], [90.3, 94.0], [90.4, 94.0], [90.5, 94.0], [90.6, 94.0], [90.7, 95.0], [90.8, 95.0], [90.9, 95.0], [91.0, 96.0], [91.1, 96.0], [91.2, 96.0], [91.3, 96.0], [91.4, 97.0], [91.5, 97.0], [91.6, 97.0], [91.7, 98.0], [91.8, 98.0], [91.9, 98.0], [92.0, 98.0], [92.1, 99.0], [92.2, 99.0], [92.3, 99.0], [92.4, 100.0], [92.5, 100.0], [92.6, 100.0], [92.7, 101.0], [92.8, 101.0], [92.9, 101.0], [93.0, 101.0], [93.1, 102.0], [93.2, 102.0], [93.3, 102.0], [93.4, 103.0], [93.5, 103.0], [93.6, 103.0], [93.7, 104.0], [93.8, 104.0], [93.9, 104.0], [94.0, 105.0], [94.1, 105.0], [94.2, 105.0], [94.3, 106.0], [94.4, 106.0], [94.5, 106.0], [94.6, 107.0], [94.7, 107.0], [94.8, 108.0], [94.9, 108.0], [95.0, 108.0], [95.1, 109.0], [95.2, 109.0], [95.3, 109.0], [95.4, 110.0], [95.5, 110.0], [95.6, 111.0], [95.7, 111.0], [95.8, 112.0], [95.9, 112.0], [96.0, 113.0], [96.1, 113.0], [96.2, 114.0], [96.3, 114.0], [96.4, 115.0], [96.5, 115.0], [96.6, 116.0], [96.7, 116.0], [96.8, 117.0], [96.9, 118.0], [97.0, 119.0], [97.1, 119.0], [97.2, 120.0], [97.3, 121.0], [97.4, 123.0], [97.5, 124.0], [97.6, 125.0], [97.7, 127.0], [97.8, 130.0], [97.9, 135.0], [98.0, 142.0], [98.1, 150.0], [98.2, 158.0], [98.3, 168.0], [98.4, 196.0], [98.5, 230.0], [98.6, 252.0], [98.7, 272.0], [98.8, 290.0], [98.9, 305.0], [99.0, 318.0], [99.1, 334.0], [99.2, 381.0], [99.3, 417.0], [99.4, 454.0], [99.5, 484.0], [99.6, 526.0], [99.7, 596.0], [99.8, 678.0], [99.9, 818.0], [100.0, 6433.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 8343105.0, "series": [{"data": [[0.0, 8343105.0], [600.0, 10401.0], [700.0, 6320.0], [800.0, 4539.0], [900.0, 2306.0], [1000.0, 1588.0], [1100.0, 644.0], [1200.0, 472.0], [1300.0, 105.0], [1400.0, 88.0], [1500.0, 71.0], [100.0, 547052.0], [1600.0, 31.0], [1700.0, 47.0], [1800.0, 5.0], [1900.0, 8.0], [2000.0, 3.0], [2100.0, 39.0], [2200.0, 24.0], [2300.0, 3.0], [2400.0, 18.0], [2500.0, 5.0], [2600.0, 2.0], [2700.0, 17.0], [2800.0, 8.0], [200.0, 41153.0], [3800.0, 1.0], [300.0, 34850.0], [400.0, 27010.0], [6400.0, 3.0], [500.0, 14219.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 6400.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 285.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 8993417.0, "series": [{"data": [[1.0, 40435.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 8993417.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 285.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 55.06159211911388, "minX": 1.53091836E12, "maxY": 1000.0, "series": [{"data": [[1.53091896E12, 999.3412133425423], [1.53091866E12, 973.1162709291151], [1.53091848E12, 392.8866933332318], [1.53091854E12, 599.1769043966443], [1.53091836E12, 55.06159211911388], [1.53091884E12, 1000.0], [1.53091842E12, 197.50864728696712], [1.5309189E12, 1000.0], [1.53091872E12, 1000.0], [1.53091878E12, 1000.0], [1.5309186E12, 797.0501249002983]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53091896E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 1.6230964467005071, "minX": 1.0, "maxY": 89.21544869367658, "series": [{"data": [[2.0, 10.331658291457288], [3.0, 4.833333333333333], [4.0, 3.825484764542937], [5.0, 3.4869466515323513], [6.0, 4.190721649484541], [7.0, 3.0032467532467537], [8.0, 3.7174929840972877], [9.0, 1.6230964467005071], [10.0, 1.8973154362416085], [11.0, 4.072247135027405], [12.0, 2.827810972297667], [13.0, 2.816743236345072], [14.0, 2.6447429365446946], [15.0, 2.216988416988418], [16.0, 2.5710108604845425], [17.0, 2.115444015444017], [18.0, 2.042016806722689], [19.0, 2.456831831831832], [20.0, 2.2391228680821413], [21.0, 2.211409395973155], [22.0, 2.2174744897959213], [23.0, 2.5428751576292585], [24.0, 2.367762687634028], [25.0, 2.2385126964933497], [26.0, 2.2392372146778405], [27.0, 2.6451292246520897], [28.0, 3.0046931407942274], [29.0, 2.625648854961831], [30.0, 2.7258934592043165], [31.0, 2.7551563539587494], [32.0, 2.825417622011137], [33.0, 4.397283531409149], [34.0, 3.303706369197555], [35.0, 3.771650759985857], [36.0, 3.5617263298762096], [37.0, 3.6322451698867457], [38.0, 3.3954022988505783], [39.0, 3.5431893687707596], [40.0, 3.7055462184873993], [41.0, 3.9872780280943587], [42.0, 3.4338255781554823], [43.0, 2.8252559726962456], [44.0, 3.391649048625794], [45.0, 3.645388223032831], [46.0, 3.1516279069767386], [47.0, 3.986455331412099], [48.0, 3.2657358663309703], [49.0, 4.136143548846477], [50.0, 3.456781447645821], [51.0, 4.807339449541283], [52.0, 5.1425264550264655], [53.0, 5.378571428571439], [54.0, 5.389693499494782], [55.0, 5.421052631578938], [56.0, 5.385781306387599], [57.0, 5.594322673374059], [58.0, 7.071353251318111], [59.0, 5.045865834633389], [60.0, 3.576693886559251], [61.0, 4.624366910523353], [62.0, 7.047972763850217], [63.0, 4.335851367905275], [64.0, 5.604983510443393], [65.0, 6.846927775781522], [66.0, 7.277969613259668], [67.0, 6.461091378753634], [68.0, 5.877385772122617], [69.0, 6.641491085899519], [70.0, 6.873796081036207], [71.0, 6.965820312500011], [72.0, 5.402445803224014], [73.0, 5.246481970096734], [74.0, 5.650263157894753], [75.0, 5.546138902379796], [76.0, 4.8147010163082085], [77.0, 6.76341201716738], [78.0, 5.705219308992909], [79.0, 5.9977087576374775], [80.0, 4.883630888363079], [81.0, 6.580607814761215], [82.0, 5.338540452319874], [83.0, 7.238476400772852], [84.0, 6.352589182968937], [85.0, 5.838161838161846], [86.0, 6.485118350128895], [87.0, 6.290606653620366], [88.0, 7.093707804482837], [89.0, 5.553882555388231], [90.0, 6.275689223057639], [91.0, 6.61163866569273], [92.0, 5.237394957983193], [93.0, 6.888971869554398], [94.0, 6.494017487344692], [95.0, 8.904810996563562], [96.0, 7.396082178690868], [97.0, 10.826250470101563], [98.0, 7.218963831867048], [99.0, 7.982133188955087], [100.0, 6.651960784313712], [101.0, 8.613329503016406], [102.0, 6.9278584392014535], [103.0, 7.0805665196192145], [104.0, 6.284999999999993], [105.0, 10.300107952500884], [106.0, 11.697213830144333], [107.0, 11.784024815820095], [108.0, 8.573271413828703], [109.0, 6.484868863483518], [110.0, 7.5130694548170265], [111.0, 7.588276181649704], [112.0, 8.83102744386482], [113.0, 8.722832722832718], [114.0, 7.196285352469413], [115.0, 8.500498256103633], [116.0, 7.237029288702942], [117.0, 9.237450199203188], [118.0, 7.431280630726605], [119.0, 8.471354806983022], [120.0, 8.001878816345702], [121.0, 8.350107836089137], [122.0, 7.899080348499513], [123.0, 8.192284013954424], [124.0, 10.249938559842715], [125.0, 8.262073548958769], [126.0, 9.472411186696919], [127.0, 8.61561152711594], [128.0, 11.270710059171567], [129.0, 7.37806580259222], [130.0, 9.78952635090061], [131.0, 11.855777844132554], [132.0, 13.637354651162802], [133.0, 17.363362357669082], [134.0, 12.784388995521418], [135.0, 13.133571660708501], [136.0, 12.933569816188307], [137.0, 10.261010537692533], [138.0, 9.554662719391033], [139.0, 10.12145848731215], [140.0, 8.635054515531799], [141.0, 11.633509308141152], [142.0, 10.065483329335581], [143.0, 11.749099972306865], [144.0, 9.221808627107501], [145.0, 11.276667604840988], [146.0, 11.390192397935245], [147.0, 10.012081148848882], [148.0, 8.644850628930815], [149.0, 14.527670074021849], [150.0, 14.983748645720517], [151.0, 15.807174887892346], [152.0, 13.798368678629686], [153.0, 13.996060407091244], [154.0, 16.945569620253185], [155.0, 14.946507237256139], [156.0, 13.328231292517009], [157.0, 15.60086840347361], [158.0, 14.77935813274984], [159.0, 17.244805194805163], [160.0, 15.568646232439328], [161.0, 16.12246963562751], [162.0, 16.25868983957213], [163.0, 15.800323624595466], [164.0, 16.54886709502874], [165.0, 11.231865614660222], [166.0, 18.506089309878213], [167.0, 14.66378539493297], [168.0, 10.266945606694568], [169.0, 15.846374730796867], [170.0, 13.450857280850045], [171.0, 14.505047591577704], [172.0, 15.33089430894309], [173.0, 11.345773874862754], [174.0, 14.974912485414222], [175.0, 16.614340410720473], [176.0, 18.523655217109518], [177.0, 15.674528301886793], [178.0, 11.278210116731541], [179.0, 17.01777939042093], [180.0, 18.94687499999998], [181.0, 17.435955056179772], [182.0, 17.315178859168537], [183.0, 17.414210870988875], [184.0, 17.407131280388963], [185.0, 17.650877774097307], [186.0, 18.281170483460542], [187.0, 17.59706726171501], [188.0, 19.64205816554804], [189.0, 13.558013765978343], [190.0, 18.08428030303032], [191.0, 17.043978748524204], [192.0, 14.013868251609708], [193.0, 13.120473696196793], [194.0, 16.483029453015444], [195.0, 14.505715705765414], [196.0, 14.654250781916401], [197.0, 14.88673213062346], [198.0, 13.924662764062077], [199.0, 15.876726085864927], [200.0, 14.148415657036312], [201.0, 16.14424373146401], [202.0, 13.511353315168012], [203.0, 14.951918406993682], [204.0, 12.58316361167686], [205.0, 16.649774209734012], [206.0, 13.359140281950515], [207.0, 15.758468335787958], [208.0, 12.643057503506347], [209.0, 14.664081632653083], [210.0, 16.475409836065566], [211.0, 14.495837187789055], [212.0, 16.601609135738343], [213.0, 14.071173583221789], [214.0, 15.579924572091686], [215.0, 17.136593204775036], [216.0, 15.39467680608364], [217.0, 18.935787434265148], [218.0, 20.638687283054576], [219.0, 21.109096795079264], [220.0, 20.978081321473926], [221.0, 20.638792832442636], [222.0, 21.11851851851849], [223.0, 22.103025936599426], [224.0, 23.500476341695837], [225.0, 20.658398744113065], [226.0, 18.246951219512177], [227.0, 21.19445329933058], [228.0, 25.728944464876765], [229.0, 19.97847411444144], [230.0, 15.035257927117842], [231.0, 17.049422178509992], [232.0, 15.272863247863194], [233.0, 22.498085513720483], [234.0, 24.14508393285369], [235.0, 19.900115251632705], [236.0, 24.951885565669794], [237.0, 21.732887615409144], [238.0, 20.05737475510773], [239.0, 18.778841433480544], [240.0, 18.28116983068238], [241.0, 18.035758629252566], [242.0, 21.24592260952994], [243.0, 31.208234362628637], [244.0, 16.96966868875404], [245.0, 16.011966213045543], [246.0, 19.424242424242387], [247.0, 18.215192597374628], [248.0, 18.733045977011475], [249.0, 16.726562499999996], [250.0, 20.04713114754103], [251.0, 17.110884353741486], [252.0, 18.812045169385154], [253.0, 16.808695652173938], [254.0, 19.167167919799464], [255.0, 16.492422528839654], [257.0, 17.697959183673508], [256.0, 18.43484486873505], [258.0, 18.471010901882952], [259.0, 20.77062744196733], [260.0, 18.653309662693403], [261.0, 17.960269516728566], [262.0, 21.147303461228834], [263.0, 19.01130416579446], [264.0, 17.839592274678104], [270.0, 20.617727897388903], [271.0, 18.66726296958855], [268.0, 18.65904959750719], [269.0, 17.92711437084573], [265.0, 17.486523842432636], [266.0, 20.792185166749675], [267.0, 18.42239819004526], [273.0, 17.374139250191288], [272.0, 20.347022587269], [274.0, 20.50513478818993], [275.0, 20.567888999008936], [276.0, 17.895008992805778], [277.0, 19.48875351452665], [278.0, 20.623222136022836], [279.0, 27.71209273182959], [280.0, 22.180732277330556], [286.0, 20.082488805090744], [287.0, 16.774531095755183], [284.0, 17.62280701754384], [285.0, 18.733105802047792], [281.0, 16.291897435897415], [282.0, 18.87674169346193], [283.0, 19.889175862878623], [289.0, 19.94831150930394], [288.0, 19.81188118811883], [290.0, 17.410159362549724], [291.0, 20.62180094786732], [292.0, 19.458274398868422], [293.0, 19.54457323498418], [294.0, 19.89059281300059], [295.0, 18.777059077188447], [296.0, 22.501937483854256], [302.0, 25.158523042754005], [303.0, 18.524222551301058], [300.0, 26.47041022192338], [301.0, 19.832946186604786], [297.0, 28.56027482823233], [298.0, 27.251149954001846], [299.0, 26.48593656493113], [305.0, 19.27625133120341], [304.0, 24.73598971722364], [306.0, 23.426145136387074], [307.0, 21.36053593179055], [308.0, 23.982250065257116], [309.0, 19.54452813469209], [310.0, 25.312023604622595], [311.0, 20.58542600896852], [312.0, 21.98631408025978], [318.0, 22.1525534701004], [319.0, 22.69656115670185], [316.0, 18.386774797255203], [317.0, 20.367384757933724], [313.0, 20.198361469712086], [314.0, 22.127318191289817], [315.0, 21.438666044776117], [321.0, 21.435383244206875], [320.0, 20.225162376713968], [322.0, 19.949414798651052], [323.0, 21.18825957349238], [324.0, 21.69950405770963], [325.0, 23.988179074446727], [326.0, 23.361442516269012], [327.0, 21.825966303270608], [328.0, 23.1440922190202], [334.0, 23.885382955771338], [335.0, 24.390729911197766], [332.0, 20.568062827225056], [333.0, 24.152212001752027], [329.0, 20.37966397556183], [330.0, 20.77602834087778], [331.0, 21.802767406105854], [337.0, 20.70945665698883], [336.0, 25.184101438673476], [338.0, 26.04076863152431], [339.0, 26.146964856230046], [340.0, 30.422178988326856], [341.0, 30.536788799523336], [342.0, 24.27774214239898], [343.0, 23.70333333333334], [344.0, 23.216494845360835], [350.0, 21.955436304246437], [351.0, 25.04125269978404], [348.0, 20.831719876415992], [349.0, 26.086648767390795], [345.0, 26.16353147730124], [346.0, 22.40733869305294], [347.0, 30.895939086294423], [353.0, 21.947613012251793], [352.0, 24.734498834498815], [354.0, 25.305636540330493], [355.0, 23.980978841632854], [356.0, 21.665105908584184], [357.0, 26.89508032128517], [358.0, 22.87684529828113], [359.0, 27.731251599692868], [360.0, 25.928253024835495], [366.0, 23.375841368018914], [367.0, 24.166666666666604], [364.0, 34.80692108667538], [365.0, 26.376353039134084], [361.0, 26.166185804962424], [362.0, 37.04910714285723], [363.0, 33.93615676359039], [369.0, 25.03539996088403], [368.0, 23.757192676547582], [370.0, 25.71597167584581], [371.0, 23.84308062575205], [372.0, 25.943490545533546], [373.0, 26.96024464831805], [374.0, 26.013522215067646], [375.0, 27.085024154589345], [376.0, 24.889312121891084], [382.0, 27.58922716627642], [383.0, 33.20600858369094], [380.0, 26.784104113409207], [381.0, 26.44538974476892], [377.0, 26.604786076867246], [378.0, 25.138181818181824], [379.0, 29.054675903018353], [385.0, 29.071167883211732], [384.0, 35.13943355119821], [386.0, 23.989743589743583], [387.0, 26.862772050400967], [388.0, 25.199689716312072], [389.0, 27.044195099610707], [390.0, 24.611927761444736], [391.0, 21.754302301472134], [392.0, 26.48909853249475], [398.0, 38.454122340425485], [399.0, 36.47103892123808], [396.0, 38.20793140407298], [397.0, 41.77964547677262], [393.0, 31.390526581002696], [394.0, 24.16340841478968], [395.0, 37.86834270592129], [401.0, 36.63022900763363], [400.0, 36.97819314641746], [402.0, 40.9727144866386], [403.0, 36.06174698795183], [404.0, 36.973826714801454], [405.0, 36.53255885050439], [406.0, 27.979656862745145], [407.0, 29.91748024174801], [408.0, 37.65083713850834], [414.0, 37.66379044684138], [415.0, 37.52140904949906], [412.0, 31.824411134903634], [413.0, 38.09492924528303], [409.0, 37.82187894073139], [410.0, 31.292445774121173], [411.0, 37.01221692491064], [417.0, 31.307084729535706], [416.0, 29.703285420944518], [418.0, 36.32958801498128], [419.0, 32.85140257771038], [420.0, 33.40395778364106], [421.0, 26.456582035417167], [422.0, 24.151904150620435], [423.0, 38.46190880770316], [424.0, 30.80465232616306], [430.0, 31.078929306794826], [431.0, 28.949986975775023], [428.0, 34.60228898426328], [429.0, 30.153244130270174], [425.0, 40.0252415082581], [426.0, 43.347529258777556], [427.0, 38.30992455020312], [433.0, 32.34543239951279], [432.0, 31.869423507842637], [434.0, 27.004519044544836], [435.0, 32.40946601941743], [436.0, 28.036896877956487], [437.0, 30.404061772794606], [438.0, 31.686988651359165], [439.0, 28.258631011774156], [440.0, 37.7966666666666], [446.0, 40.92320351069668], [447.0, 42.444337811900155], [444.0, 30.534386617100342], [445.0, 40.83415147265079], [441.0, 27.821715328467118], [442.0, 28.22198460222413], [443.0, 28.366368286445017], [449.0, 31.69005696530284], [448.0, 43.57124310288859], [450.0, 30.905216155875856], [451.0, 33.047781569965814], [452.0, 28.315150223737472], [453.0, 32.794336453083844], [454.0, 28.485769885672607], [455.0, 33.08992115917322], [456.0, 31.3606290672451], [462.0, 37.33668478260881], [463.0, 37.522437531871496], [460.0, 30.765239400970337], [461.0, 30.401133786848092], [457.0, 34.929152148664464], [458.0, 31.640751369684263], [459.0, 28.67647058823529], [465.0, 33.85917602996251], [464.0, 44.82523638734915], [466.0, 31.88536474852748], [467.0, 29.48366701791355], [468.0, 46.51510122801194], [469.0, 33.87737226277377], [470.0, 30.57189624779645], [471.0, 35.781105990783395], [472.0, 42.20690681750507], [478.0, 42.011072445428674], [479.0, 51.957723035952036], [476.0, 40.7473277909739], [477.0, 43.46418428526346], [473.0, 46.80639841688649], [474.0, 51.41736028537444], [475.0, 37.26448688896086], [481.0, 52.49595959595945], [480.0, 49.59203810820006], [482.0, 44.23510722795873], [483.0, 48.97448979591843], [484.0, 35.34543586230519], [485.0, 36.5704753961636], [486.0, 51.26508807392449], [487.0, 45.86345776031431], [488.0, 51.33960362781319], [494.0, 35.5703599812998], [495.0, 40.347654041831476], [492.0, 32.84079061685492], [493.0, 32.334975369458235], [489.0, 48.47136709698769], [490.0, 47.823064770932085], [491.0, 32.29266155531214], [497.0, 48.16916558018261], [496.0, 40.157409991627034], [498.0, 46.77222420564085], [499.0, 54.11547619047627], [500.0, 33.77446388957351], [501.0, 46.85537918871254], [502.0, 50.6376756551462], [503.0, 45.606537029375325], [504.0, 40.72586439155817], [510.0, 39.86392166708514], [511.0, 44.51862940785101], [508.0, 51.24838411819026], [509.0, 43.51937984496123], [505.0, 39.552661705781254], [506.0, 56.28737588652481], [507.0, 45.725288831835684], [515.0, 34.739609644087274], [512.0, 53.53833551769334], [526.0, 43.58643847486996], [527.0, 47.28297872340425], [524.0, 43.38120740019466], [525.0, 34.9533369506242], [522.0, 35.46158929456476], [523.0, 30.27899999999996], [513.0, 43.73851971907081], [514.0, 35.81562853907131], [516.0, 36.567302452316085], [517.0, 34.87251954299446], [518.0, 38.551732493336544], [519.0, 33.36064457557872], [528.0, 41.45909207489102], [542.0, 53.609432082364656], [543.0, 41.15770409584839], [540.0, 47.7994292702813], [541.0, 40.20757020757016], [538.0, 34.934970139349645], [539.0, 52.95239376008606], [536.0, 30.75142045454546], [537.0, 46.182228490832145], [529.0, 42.05652724968318], [530.0, 44.891721491228004], [531.0, 33.414847161572055], [532.0, 36.49977168949775], [533.0, 37.3275543226999], [534.0, 43.13130459284304], [535.0, 37.57669365147002], [520.0, 38.202573099415204], [521.0, 31.837631327602697], [547.0, 53.07571152252002], [544.0, 54.19057029926597], [558.0, 35.67809523809529], [559.0, 40.401393728223006], [556.0, 44.32266009852219], [557.0, 46.26474127557154], [554.0, 56.971673254281946], [555.0, 48.72375366568913], [545.0, 39.286048932847486], [546.0, 40.91821771009594], [548.0, 35.83914209115287], [549.0, 44.67667984189725], [550.0, 35.766767983789244], [551.0, 37.368604941352686], [560.0, 34.518867924528195], [574.0, 36.769655477031684], [575.0, 41.40345072086985], [572.0, 44.94541062801944], [573.0, 53.48732394366187], [570.0, 52.491803278688494], [571.0, 42.139551875304406], [568.0, 43.73733108108108], [569.0, 45.50521059487624], [561.0, 41.503624093976555], [562.0, 50.167638483965014], [563.0, 48.42586673223518], [564.0, 49.19930525401643], [565.0, 43.4800728763379], [566.0, 57.400476352500654], [567.0, 46.41305418719202], [552.0, 46.82682563338297], [553.0, 53.94171279713446], [579.0, 42.26919739696304], [576.0, 35.23925438596492], [590.0, 44.68317802844536], [591.0, 33.96757322175727], [588.0, 37.275520077406924], [589.0, 40.6249743694894], [586.0, 35.65193730953413], [587.0, 42.33561643835608], [577.0, 41.85974887467423], [578.0, 41.62068965517241], [580.0, 58.07915831663332], [581.0, 56.42011834319538], [582.0, 45.39056224899595], [583.0, 43.65298580042793], [592.0, 35.048121414029325], [606.0, 37.68399859943973], [607.0, 35.04439663602577], [604.0, 36.91631119236248], [605.0, 33.56708004509576], [602.0, 40.07981651376154], [603.0, 45.538272816486895], [600.0, 47.979734801100804], [601.0, 43.37638987461554], [593.0, 41.257142857142945], [594.0, 48.72078280044104], [595.0, 57.951345474313705], [596.0, 53.682516982481204], [597.0, 44.275730622617544], [598.0, 46.24613800205976], [599.0, 44.91751500913598], [584.0, 34.98504215392984], [585.0, 40.09275425578355], [611.0, 42.84596074851659], [608.0, 38.325137770241604], [622.0, 39.67406923579359], [623.0, 41.23136308805784], [620.0, 39.22554711924958], [621.0, 39.299729785907424], [618.0, 44.25105720008904], [619.0, 36.68583724569646], [609.0, 41.23558648111337], [610.0, 38.669528753993745], [612.0, 39.72962583290611], [613.0, 40.66337400735998], [614.0, 44.117718446601934], [615.0, 49.117508505626894], [624.0, 41.13935776039514], [638.0, 52.767521367521425], [639.0, 37.98475549396153], [636.0, 32.040199958341994], [637.0, 36.512110091743104], [634.0, 49.17766990291272], [635.0, 36.7931297709923], [632.0, 38.5719164323021], [633.0, 43.78039513677812], [625.0, 43.658259486480375], [626.0, 41.04548394050438], [627.0, 43.20777726645192], [628.0, 52.65735735735744], [629.0, 44.91233413095485], [630.0, 40.500858737655506], [631.0, 54.501585471317384], [616.0, 36.53237121667645], [617.0, 50.34911242603553], [643.0, 41.810584958217305], [640.0, 42.433280381254974], [654.0, 44.11138701667272], [655.0, 40.59867021276607], [652.0, 39.89676002196584], [653.0, 43.37255803263621], [650.0, 49.641115799343666], [651.0, 44.49460364719016], [641.0, 41.30728667305852], [642.0, 44.60699081335424], [644.0, 40.33820410087208], [645.0, 41.083297917552116], [646.0, 41.33197740113001], [647.0, 43.10622090562844], [656.0, 42.23230834035377], [670.0, 45.16498171649818], [671.0, 41.71921982933769], [668.0, 42.02271844660193], [669.0, 40.48284835580782], [666.0, 42.939820742637494], [667.0, 50.535818005808295], [664.0, 46.61353661353672], [665.0, 43.29379279876305], [657.0, 46.49625072101524], [658.0, 36.35747836835598], [659.0, 44.17474010174736], [660.0, 41.771801682160344], [661.0, 42.44170736886806], [662.0, 53.284204167925246], [663.0, 44.37696127110234], [648.0, 44.48847197106697], [649.0, 49.73493975903608], [675.0, 53.159990630124184], [672.0, 51.97739962775858], [686.0, 42.806818181818194], [687.0, 45.03159103963241], [684.0, 52.27405696689761], [685.0, 44.759373014191816], [682.0, 63.872029250457004], [683.0, 61.51765468091992], [673.0, 42.63875548131141], [674.0, 37.339708561020096], [676.0, 52.095430747263194], [677.0, 59.9283333333333], [678.0, 54.127124255131314], [679.0, 50.65016501650154], [688.0, 44.46836241328561], [702.0, 68.53622229573274], [703.0, 60.663363450888994], [700.0, 38.461749633967834], [701.0, 42.15773997059449], [698.0, 39.23221601489772], [699.0, 41.49053973312092], [696.0, 44.829727958046625], [697.0, 35.689073790234325], [689.0, 41.851619433198465], [690.0, 41.054157303370964], [691.0, 45.2917726887192], [692.0, 40.82613937786351], [693.0, 47.73826264459069], [694.0, 45.112803622890034], [695.0, 70.89204545454535], [680.0, 60.5210364289379], [681.0, 49.77963680881453], [707.0, 56.5373655913978], [704.0, 52.59874686716801], [718.0, 43.86495338876284], [719.0, 48.47255060728751], [716.0, 43.549821690790814], [717.0, 46.061791509224285], [714.0, 42.26885245901646], [715.0, 65.33794763767689], [705.0, 53.91715374841192], [706.0, 52.93504931440934], [708.0, 60.81241283124115], [709.0, 44.86596769623111], [710.0, 55.70275495408389], [711.0, 46.67999999999996], [720.0, 46.07723474297288], [734.0, 55.72106261859582], [735.0, 54.315501664289314], [732.0, 75.43586662661464], [733.0, 61.35759312320905], [730.0, 45.5102123356926], [731.0, 66.85733377881726], [728.0, 50.51506387081223], [729.0, 63.28834355828219], [721.0, 51.0037853484747], [722.0, 44.25744342993238], [723.0, 45.99976700838782], [724.0, 47.32402472820303], [725.0, 47.1151895677373], [726.0, 47.01141141141145], [727.0, 54.86091127098318], [712.0, 51.967427616926585], [713.0, 43.71809930592638], [739.0, 49.59987141020138], [736.0, 55.58938271604942], [750.0, 49.00394846217792], [751.0, 47.65750956991675], [748.0, 48.11629490890506], [749.0, 45.068371864239985], [746.0, 46.313919867823245], [747.0, 47.240695988400205], [737.0, 63.60218079493475], [738.0, 58.26482910694592], [740.0, 46.96184901090035], [741.0, 44.416147686832716], [742.0, 49.62380846818901], [743.0, 45.37757605495576], [752.0, 50.33013937282232], [766.0, 57.07144427346665], [767.0, 46.24915691331083], [764.0, 72.12504080966362], [765.0, 56.94104477611932], [762.0, 89.0152263374485], [763.0, 64.27961115374771], [760.0, 51.557667934093644], [761.0, 48.081847853376956], [753.0, 50.80811164413421], [754.0, 47.300342026507145], [755.0, 46.32795078815841], [756.0, 47.621766280107146], [757.0, 49.31540665638089], [758.0, 52.097801047120505], [759.0, 44.61913523459057], [744.0, 47.72691680261012], [745.0, 45.03608007448794], [771.0, 50.84731686541741], [768.0, 45.00071701720845], [782.0, 44.62522889114957], [783.0, 48.18334022323273], [780.0, 46.96067557348113], [781.0, 50.21758391548815], [778.0, 48.31436258278136], [779.0, 47.97205096588584], [769.0, 49.761008656379346], [770.0, 50.962489343563426], [772.0, 44.16595264937988], [773.0, 48.02959144711701], [774.0, 49.35090329436779], [775.0, 50.58156320890915], [784.0, 51.22153386028609], [798.0, 44.70544369873218], [799.0, 50.87162461266058], [796.0, 48.29713423831075], [797.0, 45.248500749625016], [794.0, 45.50544090056287], [795.0, 70.49871904355254], [792.0, 48.01877691645144], [793.0, 47.27675276752771], [785.0, 46.019626389217166], [786.0, 45.88354340493516], [787.0, 49.06343906510826], [788.0, 48.226850690087886], [789.0, 48.36396687537868], [790.0, 49.839556832170764], [791.0, 43.0523652365238], [776.0, 44.74744027303756], [777.0, 51.641163393849716], [803.0, 66.57298225529492], [800.0, 70.0284245539764], [814.0, 58.91383468537611], [815.0, 47.59683313032886], [812.0, 58.50789607743257], [813.0, 51.94106003958653], [810.0, 69.73817966903043], [811.0, 64.4169227133068], [801.0, 67.06847230675601], [802.0, 74.85773317591489], [804.0, 59.16613653046263], [805.0, 89.21544869367658], [806.0, 61.233523999005214], [807.0, 64.97974413646035], [816.0, 53.48322610294118], [830.0, 57.38026349780411], [831.0, 66.30024509803917], [828.0, 59.444055068836015], [829.0, 71.47841338370212], [826.0, 52.334995700773966], [827.0, 69.2256227758007], [824.0, 48.24658823529418], [825.0, 49.48692640692646], [817.0, 62.483207190160826], [818.0, 50.94902386117146], [819.0, 52.69234015615107], [820.0, 55.75389177168285], [821.0, 50.238835333464394], [822.0, 51.755387931034626], [823.0, 54.0078062449961], [808.0, 74.01331521739134], [809.0, 60.926414058209744], [835.0, 62.101792431953896], [832.0, 72.91950757575758], [846.0, 49.60838048090506], [847.0, 52.569080514530604], [844.0, 54.204856787048605], [845.0, 50.57906976744199], [842.0, 49.414727041895915], [843.0, 50.28883495145631], [833.0, 53.54554170661555], [834.0, 46.704491725768314], [836.0, 55.29734848484858], [837.0, 50.153110047846894], [838.0, 54.817729729729706], [839.0, 50.61901925749443], [848.0, 49.28913912095887], [862.0, 58.70589639532115], [863.0, 62.52272727272734], [860.0, 58.14019746121305], [861.0, 57.77111664432113], [858.0, 54.46388765046818], [859.0, 52.43932380760723], [856.0, 51.95155230373741], [857.0, 54.717254408060505], [849.0, 48.66052528420235], [850.0, 52.681660192189774], [851.0, 53.604266347687414], [852.0, 46.150450658654876], [853.0, 50.35308469850114], [854.0, 54.94044166852548], [855.0, 55.91999999999986], [840.0, 52.64049889948615], [841.0, 51.64019476158497], [867.0, 47.0332790318827], [864.0, 50.51475261007718], [878.0, 64.64449351366277], [879.0, 83.2582145071294], [876.0, 47.682235332677706], [877.0, 44.17869475138123], [874.0, 46.603653989559966], [875.0, 47.353783563873264], [865.0, 56.30401529636699], [866.0, 55.862980280544846], [868.0, 58.039394407539], [869.0, 45.432964329643326], [870.0, 54.25342465753426], [871.0, 53.12212672396546], [880.0, 79.9066762383342], [894.0, 52.429491173416395], [895.0, 57.54094348019586], [892.0, 57.40095813372217], [893.0, 54.633554083885286], [890.0, 50.0596562184024], [891.0, 55.68542839274537], [888.0, 66.0460561143463], [889.0, 56.6632844795191], [881.0, 62.01726584673585], [882.0, 74.25572609208973], [883.0, 69.7677345537758], [884.0, 65.15008949117879], [885.0, 55.59710193204529], [886.0, 52.417522394581525], [887.0, 51.81613545816729], [872.0, 54.818892508143314], [873.0, 48.1960457856399], [899.0, 51.03519482851512], [896.0, 56.7113113113112], [910.0, 54.903662597114305], [911.0, 54.60743070572051], [908.0, 50.307836257309845], [909.0, 56.73330009970091], [906.0, 65.13930098063865], [907.0, 59.81568310428457], [897.0, 54.54781676935438], [898.0, 57.38551031200442], [900.0, 54.31262359920901], [901.0, 50.77329420396192], [902.0, 56.991980927611664], [903.0, 68.59987612263865], [912.0, 58.147564766839416], [926.0, 54.478494623655855], [927.0, 60.87986870897168], [924.0, 55.47408026755851], [925.0, 52.36259541984726], [922.0, 53.821039127646046], [923.0, 55.70653246496956], [920.0, 53.285142857142915], [921.0, 53.287480376766034], [913.0, 55.11483594864474], [914.0, 57.098237206914256], [915.0, 55.26954732510299], [916.0, 54.75460603684828], [917.0, 56.66560888536297], [918.0, 48.84315455187033], [919.0, 48.984604368063074], [904.0, 71.935833923095], [905.0, 58.96617555509442], [931.0, 52.44986149584485], [928.0, 68.55422740524779], [942.0, 54.00770156438024], [943.0, 62.19518033833369], [940.0, 54.75775340393331], [941.0, 56.7366789381903], [938.0, 69.64177834503292], [939.0, 52.74900095147478], [929.0, 75.53017865765328], [930.0, 52.998703943714176], [932.0, 50.424122898069285], [933.0, 54.88158131176997], [934.0, 53.84446898582732], [935.0, 48.751383399209516], [944.0, 54.25516893595565], [958.0, 63.39894435891781], [959.0, 62.29346571230665], [956.0, 57.19200954084674], [957.0, 57.46543778801828], [954.0, 47.42816901408441], [955.0, 52.482338032631006], [952.0, 59.13976847122912], [953.0, 45.45972050965885], [945.0, 57.147459972326615], [946.0, 61.11618771966094], [947.0, 55.79640852974193], [948.0, 54.569175627240156], [949.0, 49.304221533694815], [950.0, 54.00323074307087], [951.0, 53.37490706319698], [936.0, 62.53562970936494], [937.0, 73.74851895734614], [963.0, 61.8621265540917], [960.0, 58.54538592187201], [974.0, 55.21866045845291], [975.0, 53.86957308248922], [972.0, 58.41676122548225], [973.0, 53.3046234153616], [970.0, 48.353476151980665], [971.0, 51.64784251342214], [961.0, 60.15503323836669], [962.0, 66.94556213017752], [964.0, 63.6289658014005], [965.0, 63.64559234144404], [966.0, 63.05845595646056], [967.0, 50.70344177274871], [976.0, 55.96933187294624], [990.0, 56.49686192468629], [991.0, 56.04226387357589], [988.0, 47.52597402597388], [989.0, 56.94507017847862], [986.0, 64.59960356788909], [987.0, 53.9424798239179], [984.0, 53.797699849170456], [985.0, 51.16816277678049], [977.0, 54.362405623535444], [978.0, 65.54637223974738], [979.0, 57.85464895635671], [980.0, 53.73630516744291], [981.0, 55.03744067498688], [982.0, 64.74232690935072], [983.0, 49.41365777080046], [968.0, 54.81107549857542], [969.0, 62.47785016286637], [995.0, 63.47168758716877], [992.0, 56.45280979827097], [993.0, 55.33497779970411], [994.0, 57.775372124492606], [996.0, 58.74241229798974], [997.0, 62.42226056945639], [998.0, 59.38593195575036], [999.0, 64.89442937617368], [1000.0, 60.98272984726595], [1.0, 26.742574257425744]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[786.9974011906461, 49.7634697149242]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1000.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 921712.25, "minX": 1.53091836E12, "maxY": 1.4565763533333333E7, "series": [{"data": [[1.53091896E12, 7654885.3], [1.53091866E12, 1.4564671033333333E7], [1.53091848E12, 1.16569972E7], [1.53091854E12, 1.20507557E7], [1.53091836E12, 4330819.55], [1.53091884E12, 1.4022557966666667E7], [1.53091842E12, 1.1165370483333332E7], [1.5309189E12, 1.43719249E7], [1.53091872E12, 1.4565763533333333E7], [1.53091878E12, 1.4039732066666666E7], [1.5309186E12, 1.3172942566666666E7]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.53091896E12, 1629071.45], [1.53091866E12, 3099573.9833333334], [1.53091848E12, 2480781.066666667], [1.53091854E12, 2564574.4833333334], [1.53091836E12, 921712.25], [1.53091884E12, 2984205.716666667], [1.53091842E12, 2376274.25], [1.5309189E12, 3058556.45], [1.53091872E12, 3099807.566666667], [1.53091878E12, 2987860.466666667], [1.5309186E12, 2803391.966666667]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53091896E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 4.561543351259718, "minX": 1.53091836E12, "maxY": 62.24670116805233, "series": [{"data": [[1.53091896E12, 59.83156646819324], [1.53091866E12, 58.34029362022772], [1.53091848E12, 29.60178468559403], [1.53091854E12, 43.14624741472983], [1.53091836E12, 4.561543351259718], [1.53091884E12, 62.18493591108626], [1.53091842E12, 15.240738590629899], [1.5309189E12, 60.7582419364477], [1.53091872E12, 59.91040244495416], [1.53091878E12, 62.24670116805233], [1.5309186E12, 52.70696577874375]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53091896E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 4.560070225711037, "minX": 1.53091836E12, "maxY": 62.243676763231086, "series": [{"data": [[1.53091896E12, 59.82854652744856], [1.53091866E12, 58.337468233146716], [1.53091848E12, 29.599857794972987], [1.53091854E12, 43.14397370670146], [1.53091836E12, 4.560070225711037], [1.53091884E12, 62.182039730036934], [1.53091842E12, 15.239113106800476], [1.5309189E12, 60.75537764371798], [1.53091872E12, 59.9074782636539], [1.53091878E12, 62.243676763231086], [1.5309186E12, 52.70434171052211]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53091896E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.0357535005043381, "minX": 1.53091836E12, "maxY": 0.27779516344306765, "series": [{"data": [[1.53091896E12, 0.03972164024456252], [1.53091866E12, 0.1475012076654498], [1.53091848E12, 0.2422771298576856], [1.53091854E12, 0.14104605074684215], [1.53091836E12, 0.07745008021471157], [1.53091884E12, 0.0357535005043381], [1.53091842E12, 0.18107837676001576], [1.5309189E12, 0.12466768224392367], [1.53091872E12, 0.10841972202276474], [1.53091878E12, 0.07205657452693445], [1.5309186E12, 0.27779516344306765]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53091896E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 1.0, "minX": 1.53091836E12, "maxY": 6433.0, "series": [{"data": [[1.53091896E12, 2468.0], [1.53091866E12, 1479.0], [1.53091848E12, 1248.0], [1.53091854E12, 1219.0], [1.53091836E12, 1015.0], [1.53091884E12, 2767.0], [1.53091842E12, 1175.0], [1.5309189E12, 6433.0], [1.53091872E12, 2731.0], [1.53091878E12, 2563.0], [1.5309186E12, 1556.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.53091896E12, 1.0], [1.53091866E12, 1.0], [1.53091848E12, 1.0], [1.53091854E12, 1.0], [1.53091836E12, 1.0], [1.53091884E12, 1.0], [1.53091842E12, 1.0], [1.5309189E12, 1.0], [1.53091872E12, 1.0], [1.53091878E12, 1.0], [1.5309186E12, 1.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.53091896E12, 100.0], [1.53091866E12, 109.0], [1.53091848E12, 69.0], [1.53091854E12, 91.0], [1.53091836E12, 8.0], [1.53091884E12, 102.0], [1.53091842E12, 50.0], [1.5309189E12, 98.0], [1.53091872E12, 105.0], [1.53091878E12, 112.0], [1.5309186E12, 101.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.53091896E12, 486.0], [1.53091866E12, 377.9900000000016], [1.53091848E12, 155.9800000000032], [1.53091854E12, 168.0], [1.53091836E12, 53.0], [1.53091884E12, 410.0], [1.53091842E12, 71.0], [1.5309189E12, 701.0], [1.53091872E12, 415.9800000000032], [1.53091878E12, 536.9700000000048], [1.5309186E12, 171.9900000000016]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.53091896E12, 115.0], [1.53091866E12, 120.0], [1.53091848E12, 80.0], [1.53091854E12, 101.0], [1.53091836E12, 11.0], [1.53091884E12, 117.0], [1.53091842E12, 61.0], [1.5309189E12, 114.0], [1.53091872E12, 117.0], [1.53091878E12, 124.0], [1.5309186E12, 113.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53091896E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 5.0, "minX": 4955.0, "maxY": 59.0, "series": [{"data": [[16664.0, 53.0], [16665.0, 48.0], [16443.0, 46.0], [8758.0, 47.0], [4955.0, 5.0], [12775.0, 14.0], [13337.0, 28.0], [13788.0, 38.0], [15072.0, 50.0], [16063.0, 59.0], [16044.0, 54.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16665.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 5.0, "minX": 4955.0, "maxY": 59.0, "series": [{"data": [[16664.0, 53.0], [16665.0, 48.0], [16443.0, 46.0], [8758.0, 47.0], [4955.0, 5.0], [12775.0, 14.0], [13337.0, 28.0], [13788.0, 38.0], [15072.0, 50.0], [16063.0, 59.0], [16044.0, 54.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16665.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 4955.45, "minX": 1.53091836E12, "maxY": 16665.633333333335, "series": [{"data": [[1.53091896E12, 8758.45], [1.53091866E12, 16664.383333333335], [1.53091848E12, 13337.5], [1.53091854E12, 13788.05], [1.53091836E12, 4955.45], [1.53091884E12, 16044.116666666667], [1.53091842E12, 12775.733333333334], [1.5309189E12, 16443.85], [1.53091872E12, 16665.633333333335], [1.53091878E12, 16063.766666666666], [1.5309186E12, 15072.016666666666]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53091896E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 4955.45, "minX": 1.53091836E12, "maxY": 16665.633333333335, "series": [{"data": [[1.53091896E12, 8758.45], [1.53091866E12, 16664.383333333335], [1.53091848E12, 13337.55], [1.53091854E12, 13788.05], [1.53091836E12, 4955.45], [1.53091884E12, 16044.116666666667], [1.53091842E12, 12775.683333333332], [1.5309189E12, 16443.85], [1.53091872E12, 16665.633333333335], [1.53091878E12, 16063.766666666666], [1.5309186E12, 15072.016666666666]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53091896E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 4955.45, "minX": 1.53091836E12, "maxY": 16665.633333333335, "series": [{"data": [[1.53091896E12, 8758.45], [1.53091866E12, 16664.383333333335], [1.53091848E12, 13337.55], [1.53091854E12, 13788.05], [1.53091836E12, 4955.45], [1.53091884E12, 16044.116666666667], [1.53091842E12, 12775.683333333332], [1.5309189E12, 16443.85], [1.53091872E12, 16665.633333333335], [1.53091878E12, 16063.766666666666], [1.5309186E12, 15072.016666666666]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53091896E12, "title": "Transactions Per Second"}},
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
