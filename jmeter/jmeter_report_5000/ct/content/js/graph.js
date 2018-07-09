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
        data: {"result": {"minY": 0.0, "minX": 0.0, "maxY": 116188.0, "series": [{"data": [[0.0, 0.0], [0.1, 0.0], [0.2, 0.0], [0.3, 0.0], [0.4, 0.0], [0.5, 0.0], [0.6, 0.0], [0.7, 0.0], [0.8, 0.0], [0.9, 0.0], [1.0, 1.0], [1.1, 1.0], [1.2, 1.0], [1.3, 1.0], [1.4, 2.0], [1.5, 2.0], [1.6, 2.0], [1.7, 2.0], [1.8, 2.0], [1.9, 2.0], [2.0, 2.0], [2.1, 2.0], [2.2, 2.0], [2.3, 2.0], [2.4, 3.0], [2.5, 3.0], [2.6, 3.0], [2.7, 3.0], [2.8, 3.0], [2.9, 3.0], [3.0, 3.0], [3.1, 3.0], [3.2, 3.0], [3.3, 3.0], [3.4, 4.0], [3.5, 4.0], [3.6, 4.0], [3.7, 4.0], [3.8, 4.0], [3.9, 4.0], [4.0, 4.0], [4.1, 4.0], [4.2, 4.0], [4.3, 5.0], [4.4, 5.0], [4.5, 5.0], [4.6, 5.0], [4.7, 5.0], [4.8, 5.0], [4.9, 5.0], [5.0, 5.0], [5.1, 5.0], [5.2, 5.0], [5.3, 6.0], [5.4, 6.0], [5.5, 6.0], [5.6, 6.0], [5.7, 6.0], [5.8, 6.0], [5.9, 6.0], [6.0, 6.0], [6.1, 7.0], [6.2, 7.0], [6.3, 7.0], [6.4, 7.0], [6.5, 7.0], [6.6, 7.0], [6.7, 7.0], [6.8, 7.0], [6.9, 7.0], [7.0, 8.0], [7.1, 8.0], [7.2, 8.0], [7.3, 8.0], [7.4, 8.0], [7.5, 8.0], [7.6, 8.0], [7.7, 8.0], [7.8, 8.0], [7.9, 9.0], [8.0, 9.0], [8.1, 9.0], [8.2, 9.0], [8.3, 9.0], [8.4, 9.0], [8.5, 9.0], [8.6, 9.0], [8.7, 9.0], [8.8, 10.0], [8.9, 10.0], [9.0, 10.0], [9.1, 10.0], [9.2, 10.0], [9.3, 10.0], [9.4, 10.0], [9.5, 10.0], [9.6, 10.0], [9.7, 11.0], [9.8, 11.0], [9.9, 11.0], [10.0, 11.0], [10.1, 11.0], [10.2, 11.0], [10.3, 11.0], [10.4, 11.0], [10.5, 11.0], [10.6, 12.0], [10.7, 12.0], [10.8, 12.0], [10.9, 12.0], [11.0, 12.0], [11.1, 12.0], [11.2, 12.0], [11.3, 12.0], [11.4, 12.0], [11.5, 13.0], [11.6, 13.0], [11.7, 13.0], [11.8, 13.0], [11.9, 13.0], [12.0, 13.0], [12.1, 13.0], [12.2, 13.0], [12.3, 13.0], [12.4, 13.0], [12.5, 14.0], [12.6, 14.0], [12.7, 14.0], [12.8, 14.0], [12.9, 14.0], [13.0, 14.0], [13.1, 14.0], [13.2, 14.0], [13.3, 14.0], [13.4, 15.0], [13.5, 15.0], [13.6, 15.0], [13.7, 15.0], [13.8, 15.0], [13.9, 15.0], [14.0, 15.0], [14.1, 15.0], [14.2, 15.0], [14.3, 15.0], [14.4, 16.0], [14.5, 16.0], [14.6, 16.0], [14.7, 16.0], [14.8, 16.0], [14.9, 16.0], [15.0, 16.0], [15.1, 16.0], [15.2, 16.0], [15.3, 16.0], [15.4, 17.0], [15.5, 17.0], [15.6, 17.0], [15.7, 17.0], [15.8, 17.0], [15.9, 17.0], [16.0, 17.0], [16.1, 17.0], [16.2, 17.0], [16.3, 17.0], [16.4, 18.0], [16.5, 18.0], [16.6, 18.0], [16.7, 18.0], [16.8, 18.0], [16.9, 18.0], [17.0, 18.0], [17.1, 18.0], [17.2, 18.0], [17.3, 18.0], [17.4, 18.0], [17.5, 19.0], [17.6, 19.0], [17.7, 19.0], [17.8, 19.0], [17.9, 19.0], [18.0, 19.0], [18.1, 19.0], [18.2, 19.0], [18.3, 19.0], [18.4, 19.0], [18.5, 20.0], [18.6, 20.0], [18.7, 20.0], [18.8, 20.0], [18.9, 20.0], [19.0, 20.0], [19.1, 20.0], [19.2, 20.0], [19.3, 20.0], [19.4, 20.0], [19.5, 21.0], [19.6, 21.0], [19.7, 21.0], [19.8, 21.0], [19.9, 21.0], [20.0, 21.0], [20.1, 21.0], [20.2, 21.0], [20.3, 21.0], [20.4, 21.0], [20.5, 22.0], [20.6, 22.0], [20.7, 22.0], [20.8, 22.0], [20.9, 22.0], [21.0, 22.0], [21.1, 22.0], [21.2, 22.0], [21.3, 22.0], [21.4, 22.0], [21.5, 23.0], [21.6, 23.0], [21.7, 23.0], [21.8, 23.0], [21.9, 23.0], [22.0, 23.0], [22.1, 23.0], [22.2, 23.0], [22.3, 23.0], [22.4, 23.0], [22.5, 24.0], [22.6, 24.0], [22.7, 24.0], [22.8, 24.0], [22.9, 24.0], [23.0, 24.0], [23.1, 24.0], [23.2, 24.0], [23.3, 24.0], [23.4, 24.0], [23.5, 25.0], [23.6, 25.0], [23.7, 25.0], [23.8, 25.0], [23.9, 25.0], [24.0, 25.0], [24.1, 25.0], [24.2, 25.0], [24.3, 25.0], [24.4, 25.0], [24.5, 26.0], [24.6, 26.0], [24.7, 26.0], [24.8, 26.0], [24.9, 26.0], [25.0, 26.0], [25.1, 26.0], [25.2, 26.0], [25.3, 26.0], [25.4, 26.0], [25.5, 27.0], [25.6, 27.0], [25.7, 27.0], [25.8, 27.0], [25.9, 27.0], [26.0, 27.0], [26.1, 27.0], [26.2, 27.0], [26.3, 27.0], [26.4, 27.0], [26.5, 28.0], [26.6, 28.0], [26.7, 28.0], [26.8, 28.0], [26.9, 28.0], [27.0, 28.0], [27.1, 28.0], [27.2, 28.0], [27.3, 28.0], [27.4, 28.0], [27.5, 29.0], [27.6, 29.0], [27.7, 29.0], [27.8, 29.0], [27.9, 29.0], [28.0, 29.0], [28.1, 29.0], [28.2, 29.0], [28.3, 29.0], [28.4, 29.0], [28.5, 30.0], [28.6, 30.0], [28.7, 30.0], [28.8, 30.0], [28.9, 30.0], [29.0, 30.0], [29.1, 30.0], [29.2, 30.0], [29.3, 30.0], [29.4, 30.0], [29.5, 31.0], [29.6, 31.0], [29.7, 31.0], [29.8, 31.0], [29.9, 31.0], [30.0, 31.0], [30.1, 31.0], [30.2, 31.0], [30.3, 31.0], [30.4, 31.0], [30.5, 31.0], [30.6, 32.0], [30.7, 32.0], [30.8, 32.0], [30.9, 32.0], [31.0, 32.0], [31.1, 32.0], [31.2, 32.0], [31.3, 32.0], [31.4, 32.0], [31.5, 32.0], [31.6, 33.0], [31.7, 33.0], [31.8, 33.0], [31.9, 33.0], [32.0, 33.0], [32.1, 33.0], [32.2, 33.0], [32.3, 33.0], [32.4, 33.0], [32.5, 33.0], [32.6, 34.0], [32.7, 34.0], [32.8, 34.0], [32.9, 34.0], [33.0, 34.0], [33.1, 34.0], [33.2, 34.0], [33.3, 34.0], [33.4, 34.0], [33.5, 34.0], [33.6, 34.0], [33.7, 34.0], [33.8, 35.0], [33.9, 35.0], [34.0, 35.0], [34.1, 35.0], [34.2, 35.0], [34.3, 35.0], [34.4, 35.0], [34.5, 35.0], [34.6, 35.0], [34.7, 35.0], [34.8, 35.0], [34.9, 36.0], [35.0, 36.0], [35.1, 36.0], [35.2, 36.0], [35.3, 36.0], [35.4, 36.0], [35.5, 36.0], [35.6, 36.0], [35.7, 36.0], [35.8, 36.0], [35.9, 36.0], [36.0, 37.0], [36.1, 37.0], [36.2, 37.0], [36.3, 37.0], [36.4, 37.0], [36.5, 37.0], [36.6, 37.0], [36.7, 37.0], [36.8, 37.0], [36.9, 37.0], [37.0, 37.0], [37.1, 37.0], [37.2, 37.0], [37.3, 38.0], [37.4, 38.0], [37.5, 38.0], [37.6, 38.0], [37.7, 38.0], [37.8, 38.0], [37.9, 38.0], [38.0, 38.0], [38.1, 38.0], [38.2, 38.0], [38.3, 38.0], [38.4, 38.0], [38.5, 39.0], [38.6, 39.0], [38.7, 39.0], [38.8, 39.0], [38.9, 39.0], [39.0, 39.0], [39.1, 39.0], [39.2, 39.0], [39.3, 39.0], [39.4, 39.0], [39.5, 39.0], [39.6, 39.0], [39.7, 39.0], [39.8, 39.0], [39.9, 40.0], [40.0, 40.0], [40.1, 40.0], [40.2, 40.0], [40.3, 40.0], [40.4, 40.0], [40.5, 40.0], [40.6, 40.0], [40.7, 40.0], [40.8, 40.0], [40.9, 40.0], [41.0, 40.0], [41.1, 41.0], [41.2, 41.0], [41.3, 41.0], [41.4, 41.0], [41.5, 41.0], [41.6, 41.0], [41.7, 41.0], [41.8, 41.0], [41.9, 41.0], [42.0, 41.0], [42.1, 41.0], [42.2, 41.0], [42.3, 41.0], [42.4, 42.0], [42.5, 42.0], [42.6, 42.0], [42.7, 42.0], [42.8, 42.0], [42.9, 42.0], [43.0, 42.0], [43.1, 42.0], [43.2, 42.0], [43.3, 42.0], [43.4, 42.0], [43.5, 42.0], [43.6, 43.0], [43.7, 43.0], [43.8, 43.0], [43.9, 43.0], [44.0, 43.0], [44.1, 43.0], [44.2, 43.0], [44.3, 43.0], [44.4, 43.0], [44.5, 43.0], [44.6, 43.0], [44.7, 43.0], [44.8, 43.0], [44.9, 44.0], [45.0, 44.0], [45.1, 44.0], [45.2, 44.0], [45.3, 44.0], [45.4, 44.0], [45.5, 44.0], [45.6, 44.0], [45.7, 44.0], [45.8, 44.0], [45.9, 44.0], [46.0, 44.0], [46.1, 45.0], [46.2, 45.0], [46.3, 45.0], [46.4, 45.0], [46.5, 45.0], [46.6, 45.0], [46.7, 45.0], [46.8, 45.0], [46.9, 45.0], [47.0, 45.0], [47.1, 45.0], [47.2, 45.0], [47.3, 45.0], [47.4, 46.0], [47.5, 46.0], [47.6, 46.0], [47.7, 46.0], [47.8, 46.0], [47.9, 46.0], [48.0, 46.0], [48.1, 46.0], [48.2, 46.0], [48.3, 46.0], [48.4, 46.0], [48.5, 46.0], [48.6, 46.0], [48.7, 47.0], [48.8, 47.0], [48.9, 47.0], [49.0, 47.0], [49.1, 47.0], [49.2, 47.0], [49.3, 47.0], [49.4, 47.0], [49.5, 47.0], [49.6, 47.0], [49.7, 47.0], [49.8, 47.0], [49.9, 48.0], [50.0, 48.0], [50.1, 48.0], [50.2, 48.0], [50.3, 48.0], [50.4, 48.0], [50.5, 48.0], [50.6, 48.0], [50.7, 48.0], [50.8, 48.0], [50.9, 48.0], [51.0, 48.0], [51.1, 49.0], [51.2, 49.0], [51.3, 49.0], [51.4, 49.0], [51.5, 49.0], [51.6, 49.0], [51.7, 49.0], [51.8, 49.0], [51.9, 49.0], [52.0, 49.0], [52.1, 49.0], [52.2, 50.0], [52.3, 50.0], [52.4, 50.0], [52.5, 50.0], [52.6, 50.0], [52.7, 50.0], [52.8, 50.0], [52.9, 50.0], [53.0, 50.0], [53.1, 50.0], [53.2, 50.0], [53.3, 51.0], [53.4, 51.0], [53.5, 51.0], [53.6, 51.0], [53.7, 51.0], [53.8, 51.0], [53.9, 51.0], [54.0, 51.0], [54.1, 51.0], [54.2, 51.0], [54.3, 51.0], [54.4, 52.0], [54.5, 52.0], [54.6, 52.0], [54.7, 52.0], [54.8, 52.0], [54.9, 52.0], [55.0, 52.0], [55.1, 52.0], [55.2, 52.0], [55.3, 52.0], [55.4, 53.0], [55.5, 53.0], [55.6, 53.0], [55.7, 53.0], [55.8, 53.0], [55.9, 53.0], [56.0, 53.0], [56.1, 53.0], [56.2, 53.0], [56.3, 53.0], [56.4, 54.0], [56.5, 54.0], [56.6, 54.0], [56.7, 54.0], [56.8, 54.0], [56.9, 54.0], [57.0, 54.0], [57.1, 54.0], [57.2, 54.0], [57.3, 55.0], [57.4, 55.0], [57.5, 55.0], [57.6, 55.0], [57.7, 55.0], [57.8, 55.0], [57.9, 55.0], [58.0, 55.0], [58.1, 56.0], [58.2, 56.0], [58.3, 56.0], [58.4, 56.0], [58.5, 56.0], [58.6, 56.0], [58.7, 56.0], [58.8, 57.0], [58.9, 57.0], [59.0, 57.0], [59.1, 57.0], [59.2, 57.0], [59.3, 57.0], [59.4, 57.0], [59.5, 58.0], [59.6, 58.0], [59.7, 58.0], [59.8, 58.0], [59.9, 58.0], [60.0, 58.0], [60.1, 59.0], [60.2, 59.0], [60.3, 59.0], [60.4, 59.0], [60.5, 59.0], [60.6, 60.0], [60.7, 60.0], [60.8, 60.0], [60.9, 60.0], [61.0, 60.0], [61.1, 61.0], [61.2, 61.0], [61.3, 61.0], [61.4, 61.0], [61.5, 61.0], [61.6, 62.0], [61.7, 62.0], [61.8, 62.0], [61.9, 63.0], [62.0, 63.0], [62.1, 63.0], [62.2, 63.0], [62.3, 64.0], [62.4, 64.0], [62.5, 64.0], [62.6, 64.0], [62.7, 65.0], [62.8, 65.0], [62.9, 65.0], [63.0, 66.0], [63.1, 66.0], [63.2, 66.0], [63.3, 66.0], [63.4, 67.0], [63.5, 67.0], [63.6, 67.0], [63.7, 67.0], [63.8, 68.0], [63.9, 68.0], [64.0, 68.0], [64.1, 68.0], [64.2, 69.0], [64.3, 69.0], [64.4, 69.0], [64.5, 69.0], [64.6, 69.0], [64.7, 70.0], [64.8, 70.0], [64.9, 70.0], [65.0, 70.0], [65.1, 70.0], [65.2, 71.0], [65.3, 71.0], [65.4, 71.0], [65.5, 71.0], [65.6, 71.0], [65.7, 72.0], [65.8, 72.0], [65.9, 72.0], [66.0, 72.0], [66.1, 72.0], [66.2, 73.0], [66.3, 73.0], [66.4, 73.0], [66.5, 73.0], [66.6, 73.0], [66.7, 74.0], [66.8, 74.0], [66.9, 74.0], [67.0, 74.0], [67.1, 74.0], [67.2, 75.0], [67.3, 75.0], [67.4, 75.0], [67.5, 75.0], [67.6, 75.0], [67.7, 75.0], [67.8, 76.0], [67.9, 76.0], [68.0, 76.0], [68.1, 76.0], [68.2, 76.0], [68.3, 77.0], [68.4, 77.0], [68.5, 77.0], [68.6, 77.0], [68.7, 77.0], [68.8, 78.0], [68.9, 78.0], [69.0, 78.0], [69.1, 78.0], [69.2, 78.0], [69.3, 79.0], [69.4, 79.0], [69.5, 79.0], [69.6, 79.0], [69.7, 79.0], [69.8, 79.0], [69.9, 80.0], [70.0, 80.0], [70.1, 80.0], [70.2, 80.0], [70.3, 80.0], [70.4, 81.0], [70.5, 81.0], [70.6, 81.0], [70.7, 81.0], [70.8, 81.0], [70.9, 82.0], [71.0, 82.0], [71.1, 82.0], [71.2, 82.0], [71.3, 82.0], [71.4, 83.0], [71.5, 83.0], [71.6, 83.0], [71.7, 83.0], [71.8, 83.0], [71.9, 83.0], [72.0, 84.0], [72.1, 84.0], [72.2, 84.0], [72.3, 84.0], [72.4, 84.0], [72.5, 85.0], [72.6, 85.0], [72.7, 85.0], [72.8, 85.0], [72.9, 85.0], [73.0, 86.0], [73.1, 86.0], [73.2, 86.0], [73.3, 86.0], [73.4, 86.0], [73.5, 87.0], [73.6, 87.0], [73.7, 87.0], [73.8, 87.0], [73.9, 87.0], [74.0, 88.0], [74.1, 88.0], [74.2, 88.0], [74.3, 88.0], [74.4, 88.0], [74.5, 88.0], [74.6, 89.0], [74.7, 89.0], [74.8, 89.0], [74.9, 89.0], [75.0, 89.0], [75.1, 90.0], [75.2, 90.0], [75.3, 90.0], [75.4, 90.0], [75.5, 90.0], [75.6, 91.0], [75.7, 91.0], [75.8, 91.0], [75.9, 91.0], [76.0, 91.0], [76.1, 92.0], [76.2, 92.0], [76.3, 92.0], [76.4, 92.0], [76.5, 92.0], [76.6, 93.0], [76.7, 93.0], [76.8, 93.0], [76.9, 93.0], [77.0, 93.0], [77.1, 94.0], [77.2, 94.0], [77.3, 94.0], [77.4, 94.0], [77.5, 94.0], [77.6, 95.0], [77.7, 95.0], [77.8, 95.0], [77.9, 95.0], [78.0, 95.0], [78.1, 96.0], [78.2, 96.0], [78.3, 96.0], [78.4, 96.0], [78.5, 96.0], [78.6, 97.0], [78.7, 97.0], [78.8, 97.0], [78.9, 97.0], [79.0, 97.0], [79.1, 98.0], [79.2, 98.0], [79.3, 98.0], [79.4, 98.0], [79.5, 98.0], [79.6, 99.0], [79.7, 99.0], [79.8, 99.0], [79.9, 99.0], [80.0, 100.0], [80.1, 100.0], [80.2, 100.0], [80.3, 100.0], [80.4, 100.0], [80.5, 101.0], [80.6, 101.0], [80.7, 101.0], [80.8, 101.0], [80.9, 101.0], [81.0, 102.0], [81.1, 102.0], [81.2, 102.0], [81.3, 102.0], [81.4, 102.0], [81.5, 103.0], [81.6, 103.0], [81.7, 103.0], [81.8, 103.0], [81.9, 103.0], [82.0, 104.0], [82.1, 104.0], [82.2, 104.0], [82.3, 104.0], [82.4, 105.0], [82.5, 105.0], [82.6, 105.0], [82.7, 105.0], [82.8, 105.0], [82.9, 106.0], [83.0, 106.0], [83.1, 106.0], [83.2, 106.0], [83.3, 107.0], [83.4, 107.0], [83.5, 107.0], [83.6, 107.0], [83.7, 107.0], [83.8, 108.0], [83.9, 108.0], [84.0, 108.0], [84.1, 108.0], [84.2, 108.0], [84.3, 109.0], [84.4, 109.0], [84.5, 109.0], [84.6, 109.0], [84.7, 110.0], [84.8, 110.0], [84.9, 110.0], [85.0, 110.0], [85.1, 111.0], [85.2, 111.0], [85.3, 111.0], [85.4, 111.0], [85.5, 111.0], [85.6, 112.0], [85.7, 112.0], [85.8, 112.0], [85.9, 112.0], [86.0, 113.0], [86.1, 113.0], [86.2, 113.0], [86.3, 113.0], [86.4, 114.0], [86.5, 114.0], [86.6, 114.0], [86.7, 114.0], [86.8, 115.0], [86.9, 115.0], [87.0, 115.0], [87.1, 115.0], [87.2, 116.0], [87.3, 116.0], [87.4, 116.0], [87.5, 116.0], [87.6, 117.0], [87.7, 117.0], [87.8, 117.0], [87.9, 118.0], [88.0, 118.0], [88.1, 118.0], [88.2, 118.0], [88.3, 119.0], [88.4, 119.0], [88.5, 119.0], [88.6, 119.0], [88.7, 120.0], [88.8, 120.0], [88.9, 120.0], [89.0, 121.0], [89.1, 121.0], [89.2, 121.0], [89.3, 122.0], [89.4, 122.0], [89.5, 122.0], [89.6, 123.0], [89.7, 123.0], [89.8, 123.0], [89.9, 124.0], [90.0, 124.0], [90.1, 124.0], [90.2, 125.0], [90.3, 125.0], [90.4, 125.0], [90.5, 126.0], [90.6, 126.0], [90.7, 126.0], [90.8, 127.0], [90.9, 127.0], [91.0, 128.0], [91.1, 128.0], [91.2, 128.0], [91.3, 129.0], [91.4, 129.0], [91.5, 130.0], [91.6, 130.0], [91.7, 131.0], [91.8, 131.0], [91.9, 132.0], [92.0, 132.0], [92.1, 133.0], [92.2, 134.0], [92.3, 134.0], [92.4, 135.0], [92.5, 136.0], [92.6, 136.0], [92.7, 137.0], [92.8, 138.0], [92.9, 139.0], [93.0, 140.0], [93.1, 141.0], [93.2, 143.0], [93.3, 144.0], [93.4, 146.0], [93.5, 148.0], [93.6, 152.0], [93.7, 158.0], [93.8, 169.0], [93.9, 186.0], [94.0, 209.0], [94.1, 269.0], [94.2, 293.0], [94.3, 331.0], [94.4, 404.0], [94.5, 462.0], [94.6, 498.0], [94.7, 548.0], [94.8, 586.0], [94.9, 619.0], [95.0, 654.0], [95.1, 685.0], [95.2, 716.0], [95.3, 740.0], [95.4, 765.0], [95.5, 786.0], [95.6, 804.0], [95.7, 825.0], [95.8, 842.0], [95.9, 858.0], [96.0, 874.0], [96.1, 890.0], [96.2, 907.0], [96.3, 920.0], [96.4, 933.0], [96.5, 949.0], [96.6, 966.0], [96.7, 980.0], [96.8, 994.0], [96.9, 1007.0], [97.0, 1018.0], [97.1, 1029.0], [97.2, 1041.0], [97.3, 1054.0], [97.4, 1069.0], [97.5, 1084.0], [97.6, 1101.0], [97.7, 1119.0], [97.8, 1134.0], [97.9, 1150.0], [98.0, 1167.0], [98.1, 1185.0], [98.2, 1206.0], [98.3, 1229.0], [98.4, 1251.0], [98.5, 1283.0], [98.6, 1323.0], [98.7, 1368.0], [98.8, 1433.0], [98.9, 1522.0], [99.0, 1647.0], [99.1, 1819.0], [99.2, 2100.0], [99.3, 2507.0], [99.4, 2845.0], [99.5, 4253.0], [99.6, 6687.0], [99.7, 8211.0], [99.8, 28469.0], [99.9, 59484.0], [100.0, 116188.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 7529643.0, "series": [{"data": [[0.0, 7529643.0], [100.0, 1314827.0], [32900.0, 2.0], [35300.0, 13.0], [200.0, 24355.0], [52900.0, 8.0], [54100.0, 9.0], [54500.0, 51.0], [53300.0, 19.0], [54900.0, 4.0], [53700.0, 5.0], [56100.0, 192.0], [56900.0, 64.0], [57300.0, 252.0], [55300.0, 90.0], [56500.0, 81.0], [55700.0, 22.0], [59300.0, 72.0], [58500.0, 143.0], [58100.0, 97.0], [57700.0, 25.0], [58900.0, 28.0], [60500.0, 853.0], [60100.0, 867.0], [59700.0, 528.0], [60900.0, 252.0], [300.0, 15597.0], [400.0, 19713.0], [500.0, 22563.0], [600.0, 28818.0], [700.0, 39968.0], [800.0, 54736.0], [900.0, 64543.0], [1000.0, 70434.0], [1100.0, 55083.0], [1200.0, 34446.0], [1300.0, 20214.0], [1400.0, 11440.0], [1500.0, 8082.0], [1600.0, 6423.0], [1700.0, 5361.0], [1800.0, 4665.0], [1900.0, 3848.0], [2000.0, 1982.0], [2100.0, 1928.0], [2200.0, 2050.0], [2300.0, 2347.0], [2400.0, 2817.0], [2500.0, 3223.0], [2600.0, 3016.0], [2800.0, 1671.0], [2700.0, 2556.0], [2900.0, 620.0], [3000.0, 558.0], [3100.0, 263.0], [3300.0, 72.0], [3200.0, 159.0], [3400.0, 273.0], [3500.0, 273.0], [3600.0, 232.0], [3700.0, 447.0], [3800.0, 652.0], [3900.0, 859.0], [4000.0, 1200.0], [4200.0, 2452.0], [4300.0, 2392.0], [4100.0, 1714.0], [4400.0, 2165.0], [4500.0, 1421.0], [4600.0, 1065.0], [4800.0, 228.0], [4700.0, 359.0], [5000.0, 59.0], [5100.0, 42.0], [4900.0, 254.0], [5300.0, 19.0], [5200.0, 36.0], [5500.0, 18.0], [5600.0, 47.0], [5400.0, 19.0], [5700.0, 3.0], [5800.0, 2.0], [5900.0, 17.0], [6100.0, 9.0], [6000.0, 12.0], [6200.0, 4.0], [6300.0, 30.0], [6400.0, 43.0], [6600.0, 29.0], [6500.0, 17.0], [6700.0, 7.0], [6900.0, 102.0], [6800.0, 93.0], [7000.0, 123.0], [7100.0, 211.0], [7300.0, 396.0], [7200.0, 208.0], [7400.0, 621.0], [116100.0, 1.0], [7600.0, 1058.0], [7500.0, 911.0], [7800.0, 1532.0], [7700.0, 1340.0], [7900.0, 1086.0], [8000.0, 982.0], [8100.0, 685.0], [8300.0, 281.0], [8500.0, 58.0], [8200.0, 440.0], [8700.0, 28.0], [8400.0, 60.0], [8600.0, 12.0], [8900.0, 20.0], [9000.0, 18.0], [9200.0, 17.0], [8800.0, 7.0], [9100.0, 36.0], [9600.0, 15.0], [9700.0, 7.0], [9500.0, 5.0], [9300.0, 7.0], [9800.0, 26.0], [10100.0, 1.0], [10200.0, 4.0], [10600.0, 1.0], [10500.0, 2.0], [10400.0, 1.0], [11000.0, 10.0], [11200.0, 12.0], [11100.0, 2.0], [10800.0, 15.0], [11500.0, 1.0], [11400.0, 1.0], [12000.0, 2.0], [12200.0, 1.0], [11900.0, 1.0], [13100.0, 1.0], [13200.0, 4.0], [13300.0, 2.0], [13400.0, 8.0], [13500.0, 15.0], [13800.0, 24.0], [13600.0, 16.0], [13700.0, 31.0], [14300.0, 284.0], [14100.0, 283.0], [14000.0, 66.0], [14200.0, 192.0], [13900.0, 24.0], [14700.0, 835.0], [14500.0, 342.0], [14800.0, 752.0], [14400.0, 353.0], [14600.0, 529.0], [14900.0, 655.0], [15200.0, 464.0], [15100.0, 524.0], [15300.0, 297.0], [15000.0, 590.0], [15400.0, 228.0], [15500.0, 103.0], [15600.0, 20.0], [15700.0, 25.0], [15800.0, 11.0], [16000.0, 21.0], [15900.0, 41.0], [16200.0, 40.0], [16100.0, 14.0], [16300.0, 15.0], [17000.0, 12.0], [17200.0, 6.0], [16800.0, 3.0], [16600.0, 8.0], [18400.0, 8.0], [17600.0, 1.0], [17800.0, 3.0], [18000.0, 3.0], [18600.0, 2.0], [18800.0, 1.0], [20200.0, 6.0], [22600.0, 1.0], [24200.0, 1.0], [23600.0, 1.0], [26600.0, 11.0], [26200.0, 15.0], [26800.0, 3.0], [27600.0, 40.0], [27000.0, 18.0], [27400.0, 26.0], [27200.0, 5.0], [27800.0, 108.0], [28000.0, 88.0], [28400.0, 388.0], [28600.0, 327.0], [28200.0, 129.0], [29600.0, 195.0], [29000.0, 501.0], [29400.0, 302.0], [28800.0, 316.0], [29200.0, 316.0], [30000.0, 35.0], [29800.0, 140.0], [30400.0, 9.0], [30200.0, 4.0], [30800.0, 1.0], [32000.0, 4.0], [52800.0, 19.0], [53200.0, 2.0], [52400.0, 1.0], [54400.0, 3.0], [55200.0, 59.0], [54000.0, 14.0], [53600.0, 20.0], [54800.0, 43.0], [57200.0, 286.0], [56400.0, 146.0], [56000.0, 78.0], [56800.0, 31.0], [55600.0, 12.0], [58000.0, 56.0], [57600.0, 123.0], [58400.0, 45.0], [59200.0, 77.0], [58800.0, 38.0], [60000.0, 1085.0], [60400.0, 809.0], [60800.0, 528.0], [59600.0, 424.0], [67100.0, 1.0], [47500.0, 1.0], [53100.0, 7.0], [51900.0, 1.0], [54300.0, 28.0], [54700.0, 8.0], [53900.0, 51.0], [55100.0, 56.0], [57100.0, 185.0], [56300.0, 309.0], [55500.0, 17.0], [56700.0, 39.0], [55900.0, 46.0], [57900.0, 59.0], [57500.0, 166.0], [58300.0, 107.0], [59100.0, 88.0], [58700.0, 6.0], [59900.0, 807.0], [60300.0, 421.0], [60700.0, 486.0], [59500.0, 285.0], [61100.0, 2.0], [61500.0, 1.0], [16900.0, 4.0], [16700.0, 4.0], [17100.0, 2.0], [17300.0, 1.0], [16500.0, 5.0], [17700.0, 4.0], [17900.0, 11.0], [18700.0, 1.0], [18900.0, 1.0], [19300.0, 2.0], [18500.0, 2.0], [23700.0, 1.0], [26300.0, 18.0], [26100.0, 6.0], [27300.0, 8.0], [27500.0, 39.0], [26900.0, 4.0], [27100.0, 9.0], [26700.0, 3.0], [28500.0, 329.0], [27900.0, 136.0], [28300.0, 378.0], [28100.0, 178.0], [27700.0, 27.0], [28900.0, 400.0], [29100.0, 316.0], [29300.0, 192.0], [28700.0, 259.0], [29500.0, 357.0], [29700.0, 193.0], [29900.0, 86.0], [30100.0, 8.0], [30300.0, 19.0], [30500.0, 29.0], [30700.0, 1.0], [31300.0, 1.0], [30900.0, 6.0], [32300.0, 1.0], [51400.0, 4.0], [53000.0, 4.0], [52200.0, 3.0], [54200.0, 93.0], [55000.0, 78.0], [53800.0, 23.0], [54600.0, 58.0], [53400.0, 36.0], [56200.0, 308.0], [55800.0, 90.0], [55400.0, 19.0], [56600.0, 34.0], [57000.0, 140.0], [59000.0, 61.0], [58200.0, 145.0], [57400.0, 174.0], [57800.0, 93.0], [58600.0, 21.0], [60600.0, 655.0], [60200.0, 668.0], [59800.0, 696.0], [59400.0, 140.0], [61000.0, 13.0], [70000.0, 1.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 116100.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 92739.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 8674656.0, "series": [{"data": [[1.0, 401831.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 242831.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 8674656.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 92739.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 1.0, "minX": 1.53091974E12, "maxY": 5000.0, "series": [{"data": [[1.53091992E12, 3480.9805169931806], [1.5309204E12, 1.0], [1.5309201E12, 5000.0], [1.5309198E12, 1472.954505814178], [1.53092028E12, 5000.0], [1.53091998E12, 4484.144749889158], [1.53092016E12, 5000.0], [1.53091986E12, 2484.8075075110387], [1.53092034E12, 4500.592461525797], [1.53092004E12, 4999.798562780361], [1.53091974E12, 520.4893099572748], [1.53092022E12, 5000.0]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5309204E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 1.4583333333333335, "minX": 1.0, "maxY": 116188.0, "series": [{"data": [[3.0, 55785.5], [4.0, 631.5393258426966], [5.0, 392.6783216783217], [6.0, 2.146496815286624], [7.0, 1.9351145038167952], [8.0, 739.8149779735683], [9.0, 1.9251101321585897], [10.0, 1.7396121883656508], [11.0, 1007.0898203592815], [12.0, 67.36363636363636], [13.0, 365.56677524429966], [14.0, 1.6377118644067787], [15.0, 1.6541176470588232], [16.0, 84.07237813884785], [17.0, 244.49782608695654], [18.0, 7.572490706319703], [19.0, 55828.0], [20.0, 1.8489065606361832], [21.0, 1.7734877734877728], [22.0, 186.97682119205297], [23.0, 80.60572987721692], [24.0, 55812.0], [25.0, 55820.75], [26.0, 11328.8], [27.0, 3.2975326560232223], [28.0, 179.26941362916006], [29.0, 89.14197530864199], [30.0, 89.15813953488373], [31.0, 612.1075268817204], [32.0, 3.7996742671009742], [33.0, 167.13254786450662], [34.0, 89.27863777089784], [35.0, 4.304347826086957], [36.0, 54.214285714285715], [37.0, 229.1949934123847], [38.0, 3.087999999999998], [39.0, 3.2154696132596667], [40.0, 458.43007915567284], [41.0, 136.61327231121282], [42.0, 121.44948453608248], [43.0, 83.83870967741936], [44.0, 3.7449856733524314], [45.0, 5.8238213399503715], [46.0, 406.14418604651155], [47.0, 3.9051724137931014], [48.0, 3.9502074688796647], [49.0, 82.82644628099175], [50.0, 3.925170068027209], [51.0, 447.74760994263863], [52.0, 2.9394812680115314], [53.0, 3.06647116324536], [54.0, 7.6], [55.0, 254.0054288816504], [56.0, 57.7175572519084], [57.0, 4.341677096370463], [58.0, 210.83623693379792], [59.0, 3.4113060428849904], [60.0, 59.72593320235756], [61.0, 148.75314861460956], [62.0, 173.25180897250362], [63.0, 112.52857142857142], [64.0, 3.9917269906928654], [65.0, 15.040816326530614], [66.0, 57.071174377224196], [67.0, 169.9777347531462], [68.0, 101.506734006734], [69.0, 113.2282608695652], [70.0, 4.225450901803601], [71.0, 110.37883008356546], [72.0, 9.495798319327731], [73.0, 59.3717948717949], [74.0, 57.490689013035386], [75.0, 199.33220910623945], [76.0, 10.174397031539888], [77.0, 114.1043062200957], [78.0, 62.14313919052319], [79.0, 13.719512195121952], [80.0, 75.1933256616801], [81.0, 5.190170940170942], [82.0, 189.6221052631579], [83.0, 16.873188405797094], [84.0, 4.917727717923603], [85.0, 114.94509803921568], [86.0, 6.903225806451612], [87.0, 231.0762155059133], [88.0, 4.908745247148285], [89.0, 125.25823591923485], [90.0, 254.66666666666669], [91.0, 4.877256317689532], [92.0, 58.71741198858231], [93.0, 7.685636856368558], [94.0, 9.620164126611959], [95.0, 208.99092558983668], [96.0, 75.82089552238807], [97.0, 149.35336538461542], [98.0, 50.14701130856219], [99.0, 5.351228389444955], [100.0, 651.022346368715], [101.0, 8.407616361071934], [102.0, 8.463806970509374], [103.0, 8.52253521126761], [104.0, 534.9550827423168], [105.0, 16.518388791593665], [106.0, 9.07854137447405], [107.0, 279.40518638573747], [108.0, 9.062208398133755], [109.0, 559.2079207920792], [110.0, 15.690051020408154], [111.0, 9.238095238095243], [112.0, 237.81129476584024], [113.0, 14.563291139240507], [114.0, 16.80851063829787], [115.0, 82.8047493403694], [116.0, 272.54675118858955], [117.0, 90.16405135520684], [118.0, 11.74177215189874], [119.0, 120.93309222423147], [120.0, 189.83706070287536], [121.0, 9.946782178217823], [122.0, 10.059701492537316], [123.0, 16.436241610738254], [124.0, 388.6650246305419], [125.0, 10.551925320886827], [126.0, 94.83456425406203], [127.0, 202.04666666666668], [128.0, 55.97727272727273], [129.0, 10.873432155074122], [130.0, 11.095930232558139], [131.0, 436.86033519553075], [132.0, 12.57256461232605], [133.0, 256.71020408163264], [134.0, 11.528106508875753], [135.0, 11.2991452991453], [136.0, 300.13299663299665], [137.0, 219.91666666666666], [138.0, 104.60744985673354], [139.0, 92.663309352518], [140.0, 11.50850661625708], [141.0, 11.483290488431875], [142.0, 667.7014925373134], [143.0, 100.8330733229329], [144.0, 76.28053204353083], [145.0, 16.502772643253248], [146.0, 237.77684210526317], [147.0, 80.15338882282997], [148.0, 56.96697247706422], [149.0, 75.07521578298397], [150.0, 21.055172413793073], [151.0, 120.73096976016684], [152.0, 7.518975332068314], [153.0, 126.3492366412214], [154.0, 112.15688161693936], [155.0, 7.837692307692309], [156.0, 7634.642857142858], [157.0, 96.78191489361703], [158.0, 81.17883211678833], [159.0, 12.945578231292517], [160.0, 15.058823529411766], [161.0, 517.4913793103449], [162.0, 13.48456375838925], [163.0, 197.98070739549843], [164.0, 94.775], [165.0, 184.51928783382792], [166.0, 16.284905660377365], [167.0, 148.40467404674047], [168.0, 74.62053056516724], [169.0, 151.0618101545254], [170.0, 52.66768525592055], [171.0, 13.364477335800183], [172.0, 529.713004484305], [173.0, 9.124410933081982], [174.0, 62.8814887365328], [175.0, 166.0222841225627], [176.0, 171.22134387351775], [177.0, 13.543333333333338], [178.0, 79.60946094609461], [179.0, 267.6849894291755], [180.0, 189.00540540540544], [181.0, 123.63705103969754], [182.0, 73.96602972399153], [183.0, 74.19304152637486], [184.0, 537.2258064516129], [185.0, 107.19658119658123], [186.0, 152.72208737864077], [187.0, 14.983502538071066], [188.0, 15.703342618384399], [189.0, 1098.148148148148], [190.0, 30.991119005328667], [191.0, 196.2503863987635], [192.0, 15.690121786197563], [193.0, 149.72804232804233], [194.0, 45.80392156862745], [195.0, 96.5878084179971], [196.0, 9.83265637692932], [197.0, 202.0114566284779], [198.0, 81.0796178343949], [199.0, 55.42946708463949], [200.0, 234.39196940726578], [201.0, 29.19688109161798], [202.0, 56.997622820919176], [203.0, 131.4954128440367], [204.0, 25.00000000000001], [205.0, 128.93279839518556], [206.0, 10.464098073555164], [207.0, 412.3644859813084], [208.0, 96.09890109890111], [209.0, 96.22701949860725], [210.0, 105.31104199066874], [211.0, 20.2108262108262], [212.0, 242.0092592592592], [213.0, 121.46395563770795], [214.0, 17.6087912087912], [215.0, 102.03288490284007], [216.0, 1170.9285714285716], [217.0, 33.72549019607848], [218.0, 148.6898148148148], [219.0, 97.19101123595505], [220.0, 128.78082191780823], [221.0, 190.9533678756477], [222.0, 127.68737864077673], [223.0, 17.353863381858904], [224.0, 180.5029069767442], [225.0, 222.4336917562724], [226.0, 161.2651356993737], [227.0, 87.10204081632655], [228.0, 18.76913580246915], [229.0, 19.04261796042619], [230.0, 466.7132075471699], [231.0, 185.01421800947867], [232.0, 89.90488771466315], [233.0, 18.438003220611925], [234.0, 18.393536121673012], [235.0, 1143.6776315789475], [236.0, 37.06431535269713], [237.0, 107.0], [238.0, 73.65103189493432], [239.0, 343.4375], [240.0, 12.287287287287281], [241.0, 128.8168870803662], [242.0, 127.14484126984128], [243.0, 91.12027491408932], [244.0, 57.74960998439939], [245.0, 23.557795698924753], [246.0, 225.4234234234234], [247.0, 81.65517241379312], [248.0, 14.313060817547367], [249.0, 442.1254752851711], [250.0, 23.78733031674207], [251.0, 62.16610169491525], [252.0, 247.54244306418218], [253.0, 50.360465116279045], [254.0, 131.24150943396228], [255.0, 14.541996830427893], [256.0, 225.20664206642067], [258.0, 205.96579247434437], [260.0, 344.7124010554089], [262.0, 14.182870370370372], [264.0, 73.32221163012393], [270.0, 788.7361111111111], [268.0, 187.50661241098678], [266.0, 132.96473029045643], [272.0, 58.13191811978774], [274.0, 125.19904458598724], [276.0, 61.32182985553773], [278.0, 25.985590778097976], [280.0, 14.791891891891902], [286.0, 207.66551724137935], [284.0, 26.59414634146342], [282.0, 49.060102301790266], [288.0, 16.80128205128207], [290.0, 37.15160796324655], [292.0, 168.48071625344355], [294.0, 35.11212814645312], [296.0, 227.99241466498106], [302.0, 18.945825932504448], [300.0, 30.939890710382517], [298.0, 14.653246753246767], [304.0, 64.5446153846154], [306.0, 207.45805369127515], [308.0, 64.98083333333332], [310.0, 67.19095477386935], [312.0, 16.751306165099265], [318.0, 68.72857142857144], [316.0, 166.55452127659572], [314.0, 198.71142857142854], [320.0, 315.8912466843501], [322.0, 17.75240847784198], [324.0, 417.93286219081267], [326.0, 110.51864125932065], [328.0, 44.74186550976139], [334.0, 131.218], [332.0, 17.929178470254932], [330.0, 17.82984073763619], [336.0, 94.75549450549453], [338.0, 1.5142857142857142], [340.0, 79.90810810810811], [342.0, 241.9202898550725], [344.0, 131.55039525691697], [350.0, 132.437], [348.0, 213.2779661016949], [346.0, 67.12230215827337], [352.0, 206.94162436548217], [354.0, 89.69636135508156], [356.0, 90.95999999999994], [358.0, 96.11862396204035], [360.0, 220.86217457886684], [366.0, 38.5565912117177], [364.0, 17.18212141427618], [362.0, 17.78431372549019], [368.0, 17.538604651162817], [370.0, 36.94853523357088], [372.0, 347.0208728652751], [374.0, 41.3559657218194], [376.0, 22.60869565217392], [382.0, 20.174800354924617], [380.0, 133.51242829827916], [378.0, 21.57326007326007], [384.0, 78.70753205128207], [386.0, 25.851063829787236], [388.0, 21.351351351351347], [390.0, 1893.2747252747254], [392.0, 77.74137931034484], [398.0, 598.5300000000001], [396.0, 112.77352941176471], [394.0, 215.8700906344411], [400.0, 97.13600891861759], [402.0, 353.46132596685084], [404.0, 306.609977324263], [406.0, 267.1447368421053], [408.0, 164.40585774058576], [414.0, 79.90236220472443], [412.0, 153.6491935483871], [410.0, 34.876614060258206], [416.0, 109.22800718132855], [418.0, 110.28838451268356], [420.0, 50.503780718336444], [422.0, 76.71452420701169], [424.0, 123.57959814528593], [430.0, 248.27302631578948], [428.0, 169.4876543209876], [426.0, 50.93790849673197], [432.0, 124.02840059790734], [434.0, 782.9085365853659], [436.0, 128.33704292527815], [438.0, 189.46436781609196], [440.0, 34.11550632911392], [446.0, 34.762499999999974], [444.0, 79.10754912099273], [442.0, 262.84615384615387], [448.0, 135.63282937365014], [450.0, 60.74675324675327], [452.0, 22.25795644891122], [454.0, 100.61065573770496], [456.0, 87.74785407725321], [462.0, 25.480410447761173], [460.0, 82.09893455098933], [458.0, 106.81968721251157], [464.0, 58.35732009925556], [466.0, 79.33969465648856], [468.0, 80.16769547325103], [470.0, 223.17627118644066], [472.0, 22.79131355932202], [478.0, 248.1030640668524], [476.0, 33.25267993874426], [474.0, 176.50802139037432], [480.0, 54.68933054393307], [482.0, 94.21586715867153], [484.0, 152.9798657718121], [486.0, 68.72315035799522], [488.0, 50.60272417707149], [494.0, 26.00233918128656], [492.0, 71.65856622114218], [490.0, 68.92506811989102], [496.0, 26.251709986320108], [498.0, 122.1755485893417], [500.0, 29.016536118363796], [502.0, 85.07162921348313], [504.0, 36.14273430782463], [510.0, 59.67678958785251], [508.0, 128.00700525394043], [506.0, 30.139607032057935], [512.0, 281.6845637583893], [524.0, 163.56521739130437], [516.0, 94.3359908883827], [528.0, 504.12592592592586], [540.0, 65.04380952380954], [536.0, 25.148362235067445], [532.0, 104.26120358514726], [520.0, 28.098169717138063], [544.0, 162.1543209876543], [556.0, 246.91479099678457], [548.0, 24.808340727595397], [560.0, 57.707130730051], [572.0, 123.08671171171167], [568.0, 461.7624521072797], [564.0, 31.475719424460447], [552.0, 25.650115473441097], [576.0, 107.55263157894744], [588.0, 172.50913242009133], [580.0, 122.02043596730239], [592.0, 101.4147675478578], [604.0, 377.7409326424871], [600.0, 95.3560295324036], [596.0, 99.8048780487805], [584.0, 110.18741633199458], [608.0, 32.803343166175026], [620.0, 30.31145833333334], [612.0, 27.766595289079223], [624.0, 69.4], [636.0, 112.67602339181283], [632.0, 30.3338683788122], [628.0, 77.89495365602465], [616.0, 496.31831831831835], [640.0, 133.30701754385964], [652.0, 107.35345911949686], [644.0, 173.1043338683789], [656.0, 131.52556818181813], [668.0, 38.81767955801106], [664.0, 110.64360313315933], [660.0, 72.23021001615508], [648.0, 33.94836670179137], [672.0, 56.69115191986649], [684.0, 44.11695376246594], [676.0, 84.40017436791624], [688.0, 50.64979757085023], [700.0, 44.1308411214953], [696.0, 51.06119162640902], [692.0, 117.34484964811263], [680.0, 93.47527472527473], [704.0, 188.19171405361493], [716.0, 69.12393162393163], [708.0, 37.875249500998045], [720.0, 171.14956736711986], [732.0, 53.24229074889866], [728.0, 66.5675675675676], [724.0, 70.0133744855968], [712.0, 54.31725417439704], [736.0, 88.22072072072072], [748.0, 263.10836501901144], [740.0, 131.61624365482237], [752.0, 273.1221476510067], [764.0, 76.25694444444449], [760.0, 56.734929810074284], [756.0, 37.40490797546012], [744.0, 980.2258064516129], [768.0, 85.66304347826093], [780.0, 818.5398230088496], [772.0, 122.98228663446055], [784.0, 127.62358276643994], [796.0, 68.22607879924952], [792.0, 65.05992509363293], [788.0, 73.32432432432434], [776.0, 199.22982216142267], [800.0, 98.71860095389505], [812.0, 103.96242424242422], [804.0, 122.76470588235296], [816.0, 85.4902597402597], [828.0, 360.05882352941177], [824.0, 93.33893557422968], [820.0, 79.02215189873428], [808.0, 64.12346401404328], [832.0, 61.259803921568675], [844.0, 90.14435146443508], [836.0, 39.89719626168223], [848.0, 118.50675675675677], [860.0, 141.40148305084745], [856.0, 278.327615780446], [852.0, 64.80144404332133], [840.0, 63.54212707182309], [864.0, 102.5264317180617], [876.0, 282.78753541076486], [868.0, 55.49542961608775], [880.0, 264.8581560283688], [892.0, 422.84511784511767], [888.0, 188.2358133669608], [884.0, 112.82653061224498], [872.0, 83.5733333333333], [896.0, 184.6504065040651], [908.0, 111.82817337461304], [900.0, 62.098939929328594], [912.0, 115.54761904761904], [924.0, 50.16262135922333], [920.0, 78.48019801980195], [916.0, 107.43251304996271], [904.0, 104.96296296296299], [928.0, 79.79117147707977], [940.0, 119.44037780401409], [932.0, 112.17042606516296], [944.0, 145.26713124274085], [956.0, 152.51213592233006], [952.0, 102.4002111932418], [948.0, 137.4660766961652], [936.0, 2183.2962962962965], [960.0, 62.80661394680091], [972.0, 102.14893617021272], [964.0, 51.490155440414455], [976.0, 61.89031078610607], [988.0, 213.4455958549223], [984.0, 8327.285714285714], [980.0, 54.16003787878786], [968.0, 103.75567736883315], [992.0, 51.21527777777776], [1004.0, 67.24708926261329], [996.0, 156.95674740484424], [1008.0, 256.4279918864097], [1020.0, 87.84895833333337], [1016.0, 139.92466460268327], [1012.0, 121.75557620817851], [1000.0, 137.0611570247934], [1024.0, 928.5492957746479], [1048.0, 81.10365135453452], [1032.0, 171.36445242369837], [1056.0, 3495.272727272727], [1080.0, 181.64186046511628], [1072.0, 103.88947368421046], [1064.0, 149.4197860962567], [1040.0, 40.808406647116286], [1088.0, 75.66326530612234], [1112.0, 144.74644549763036], [1096.0, 102.3285883748517], [1120.0, 1664.2162162162163], [1144.0, 94.85850556438798], [1136.0, 79.66143216080407], [1128.0, 82.34461538461545], [1104.0, 219.98490230905864], [1152.0, 221.6551724137931], [1176.0, 95.16819787985868], [1160.0, 65.69900990099013], [1184.0, 134.68187919463094], [1208.0, 51.02491103202849], [1200.0, 29.083577712609955], [1192.0, 71.97147385103008], [1168.0, 94.53780617678379], [1216.0, 97.12634271099739], [1240.0, 143.14980988593155], [1224.0, 104.0391304347826], [1248.0, 303.04838709677415], [1272.0, 189.5574057843996], [1264.0, 109.25159914712155], [1256.0, 116.97954790096875], [1232.0, 83.15157116451006], [1280.0, 478.31249999999994], [1304.0, 116.45175438596493], [1288.0, 81.23514431239389], [1312.0, 126.46497584541066], [1336.0, 104.14859437751008], [1328.0, 126.19514237855955], [1320.0, 104.61904761904759], [1296.0, 192.87857142857143], [1344.0, 129.02980472764668], [1368.0, 99.24577861163219], [1352.0, 52.03996669442139], [1376.0, 113.19040697674426], [1400.0, 82.57932910244786], [1392.0, 75.0200573065902], [1384.0, 118.91592356687899], [1360.0, 67.17861080485115], [1408.0, 61.33633633633635], [1432.0, 201.9784482758621], [1416.0, 94.63038277511953], [1440.0, 477.5250836120402], [1464.0, 73.41180604356995], [1456.0, 38.07939508506612], [1448.0, 127.26858513189444], [1424.0, 125.02753441802261], [1472.0, 148.68136272545092], [1496.0, 171.33780760626394], [1480.0, 59.49124203821654], [1504.0, 176.2922705314011], [1528.0, 126.34377447141739], [1520.0, 47.9564375605034], [1512.0, 371.3448275862071], [1488.0, 161.72021276595746], [1536.0, 47.63510848126235], [1544.0, 164.7827160493827], [1552.0, 270.4730203223541], [1560.0, 147.20642474717425], [1568.0, 80.8112701252236], [1592.0, 132.41826381059752], [1584.0, 39.42886597938142], [1576.0, 108.0422222222222], [1600.0, 70.74828375286035], [1608.0, 76.59495192307698], [1616.0, 70.41977450130098], [1624.0, 46.70132013201323], [1632.0, 67.3874755381604], [1656.0, 82.51348547717842], [1648.0, 146.31924528301892], [1640.0, 96.25417439703149], [1664.0, 156.97105263157889], [1672.0, 530.8465753424655], [1680.0, 104.53300970873786], [1688.0, 56.30486593843102], [1696.0, 193.96265560165978], [1720.0, 86.41709183673477], [1712.0, 279.97017045454555], [1704.0, 39.328981723237625], [1728.0, 222.3977272727274], [1736.0, 80.90336658354082], [1744.0, 504.4492063492064], [1752.0, 75.75112612612604], [1760.0, 862.7886178861789], [1784.0, 541.0101694915256], [1776.0, 36.874371859296545], [1768.0, 240.80038948393374], [1792.0, 207.86144578313255], [1800.0, 201.0463096960926], [1808.0, 480.87601078167086], [1816.0, 197.10066006600658], [1824.0, 215.44223107569715], [1848.0, 74.08024072216648], [1840.0, 187.09263157894753], [1832.0, 224.35345773874897], [1856.0, 32.11303555150411], [1864.0, 64.37450199203187], [1872.0, 112.43816793893141], [1880.0, 184.11878881987582], [1888.0, 51.1554770318021], [1912.0, 96.21628959276026], [1904.0, 79.23449830890634], [1896.0, 90.51320422535213], [1920.0, 82.24383561643832], [1928.0, 301.6085409252667], [1936.0, 61.19776536312855], [1944.0, 82.99312929419119], [1952.0, 101.96875], [1976.0, 73.492774566474], [1968.0, 123.16480891719749], [1960.0, 268.56946826758156], [1984.0, 95.11068702290076], [1992.0, 690.3605769230766], [2000.0, 249.9595959595961], [2008.0, 65.39851150202986], [2016.0, 60.03853955375254], [2040.0, 41.30695443645082], [2032.0, 56.45515394912981], [2024.0, 69.07947019867551], [2048.0, 120.87840825350051], [2064.0, 423.0837563451776], [2080.0, 52.06985294117647], [2096.0, 349.21875], [2112.0, 192.3940242763771], [2160.0, 189.27153762268264], [2144.0, 307.73996175908223], [2128.0, 76.91366223908913], [2176.0, 263.86574654956087], [2192.0, 113.9618768328446], [2208.0, 397.6849710982659], [2224.0, 68.65127388535045], [2240.0, 220.72983479105895], [2288.0, 102.83487179487167], [2272.0, 54.206312548113836], [2256.0, 207.04380952380973], [2304.0, 42.426993865030674], [2320.0, 104.95894428152502], [2336.0, 139.22153846153856], [2352.0, 245.25425038639872], [2368.0, 51.37605396290054], [2416.0, 59.96467991169972], [2400.0, 72.9790628115653], [2384.0, 577.561743341404], [2432.0, 106.99673558215453], [2448.0, 47.68788249694001], [2464.0, 57.314121037464005], [2480.0, 113.83229813664592], [2496.0, 302.53018372703383], [2544.0, 110.49873577749689], [2528.0, 384.6060606060608], [2512.0, 65.72401685393258], [2560.0, 274.83004694835745], [2576.0, 146.22631166797157], [2592.0, 472.0163376446562], [2608.0, 323.9377777777776], [2624.0, 124.30029154518964], [2672.0, 66.69774011299428], [2656.0, 106.78571428571429], [2640.0, 217.499201277955], [2688.0, 158.65562913907294], [2704.0, 56.2368421052632], [2784.0, 2882.0], [2720.0, 90.98833333333327], [2736.0, 103.18394308943094], [2752.0, 84.01760176017603], [2800.0, 42.88785046728972], [2768.0, 68.25588025659304], [2816.0, 60.30739299610893], [2832.0, 145.36758620689653], [2848.0, 35.504692387904115], [2864.0, 97.84210526315793], [2880.0, 96.94063324538268], [2928.0, 61.42869796279895], [2912.0, 299.89823008849555], [2896.0, 219.4784560143624], [2944.0, 129.15619389587056], [2960.0, 116.63143124415348], [2976.0, 59.43478260869561], [2992.0, 1150.436170212766], [3008.0, 175.97555385790704], [3056.0, 313.11405835543746], [3040.0, 37.9128205128205], [3024.0, 65.31463748290012], [3072.0, 154.62306136210395], [3088.0, 75.59432048681533], [3104.0, 334.14759036144585], [3120.0, 128.91470434327616], [3136.0, 74.38768115942024], [3152.0, 74.11234567901226], [3168.0, 48.28938356164384], [3184.0, 320.5929549902153], [3200.0, 461.66468842729944], [3216.0, 226.39925834363405], [3232.0, 49.84574468085105], [3248.0, 471.858075040783], [3264.0, 85.50000000000003], [3280.0, 26.28571428571429], [3296.0, 341.6883408071748], [3312.0, 61.68260869565218], [3328.0, 225.58832565284172], [3344.0, 74.26190476190463], [3360.0, 90.09291338582679], [3376.0, 72.10818181818186], [3392.0, 145.80763688760808], [3408.0, 67.48497409326424], [3424.0, 58.804878048780495], [3440.0, 137.3591111111111], [3456.0, 157.1960431654676], [3472.0, 89.18637992831545], [3488.0, 395.09640831758026], [3504.0, 292.1744855967078], [3520.0, 58.710134656272025], [3536.0, 279.79556650246303], [3552.0, 46.195840554592664], [3568.0, 577.1188436830835], [3584.0, 41.7507987220447], [3600.0, 354.774834437086], [3616.0, 61.79019292604513], [3632.0, 2762.1246458923492], [3648.0, 76.73632958801504], [3664.0, 43.359104781281765], [3680.0, 99.12181727408914], [3696.0, 85.05801526717555], [3712.0, 54.18191377497369], [3728.0, 58.516196447230904], [3744.0, 69.9424520433694], [3760.0, 72.29117330462857], [3776.0, 181.88680131517145], [3792.0, 78.47674418604662], [3808.0, 83.7352941176471], [3824.0, 167.58775029446406], [3840.0, 326.11764705882354], [3856.0, 90.62225097024579], [3872.0, 112.18197278911566], [3888.0, 206.01434977578472], [3904.0, 234.57817418677868], [3920.0, 49.915032679738566], [3936.0, 99.60515873015862], [3952.0, 211.40271966527203], [3968.0, 68.05954198473276], [3984.0, 37.23779854620976], [4000.0, 106.90209790209794], [4016.0, 75.34264803725881], [4032.0, 431.8198653198659], [4048.0, 85.09551656920083], [4064.0, 44.265200517464464], [4080.0, 83.53287671232876], [4096.0, 46.02343750000001], [4128.0, 1180.185314685315], [4160.0, 49.28097731239096], [4192.0, 322.5509181969952], [4224.0, 90.34160583941608], [4256.0, 181.1428571428571], [4288.0, 86.83290155440407], [4320.0, 102.79411764705883], [4352.0, 926.5555555555555], [4384.0, 180.0486862442043], [4416.0, 189.7325301204817], [4448.0, 42.343621399176925], [4480.0, 64.58004926108373], [4512.0, 167.13144058885385], [4544.0, 48.712031558185394], [4576.0, 102.75734870317015], [4608.0, 670.4023323615157], [4640.0, 1027.0912621359219], [4672.0, 771.5494505494504], [4704.0, 420.9481481481479], [4736.0, 61.516279069767464], [4768.0, 87.87769784172666], [4800.0, 566.9754901960786], [4832.0, 42.02278820375332], [4864.0, 71.50514285714291], [4896.0, 54.963281250000044], [4928.0, 254.56617647058815], [4960.0, 38.21256038647345], [4992.0, 186.98044009779946], [4097.0, 198.5164220824597], [4129.0, 135.6335740072204], [4161.0, 310.865037194474], [4193.0, 57.13950691521349], [4225.0, 88.63525498891354], [4257.0, 56.436543654365444], [4289.0, 118.62185929648251], [4321.0, 59.07986406117254], [4353.0, 106.41163556531286], [4385.0, 92.88666666666661], [4417.0, 89.03766478342752], [4449.0, 297.23678160919553], [4481.0, 97.54388714733537], [4513.0, 68.79810725552046], [4545.0, 760.8110367892972], [4577.0, 549.7017543859654], [4609.0, 73.96428571428572], [4641.0, 93.79262295081982], [4673.0, 97.51563251563245], [4705.0, 66.62017167381966], [4737.0, 47.645027624309364], [4769.0, 84.25104602510466], [4801.0, 68.59000567859168], [4833.0, 92.86363636363635], [4865.0, 7952.50695517774], [4897.0, 376.91606714628284], [4929.0, 127.20893141945783], [4961.0, 530.3152173913043], [4993.0, 53.97625329815306], [2049.0, 73.25374855824687], [2065.0, 101.91348233597701], [2081.0, 169.1978417266187], [2097.0, 146.54817104585257], [2113.0, 111.21106821106821], [2161.0, 578.2454068241475], [2145.0, 224.3578838174274], [2129.0, 50.574975173783535], [2177.0, 219.5482166446499], [2193.0, 39.973705834018055], [2209.0, 173.8490175801447], [2225.0, 182.82171945701353], [2241.0, 74.50246305418713], [2289.0, 100.18537200504427], [2273.0, 467.87931034482756], [2257.0, 67.27232472324731], [2305.0, 62.31929046563194], [2321.0, 462.740648379052], [2337.0, 105.39125000000003], [2353.0, 337.94222222222226], [2369.0, 269.1557591623036], [2417.0, 236.67939698492472], [2401.0, 38.608784473953044], [2385.0, 83.22311995027987], [2433.0, 142.94200351493836], [2449.0, 291.9093678598632], [2465.0, 79.35740072202171], [2481.0, 33.19378427787933], [2497.0, 90.8657243816254], [2545.0, 51.11552795031052], [2529.0, 77.53085106382983], [2513.0, 56.669845053635264], [2561.0, 61.54983922829577], [2577.0, 100.06793478260873], [2593.0, 84.78873239436622], [2609.0, 56.034591194968556], [2625.0, 44.36017897091723], [2673.0, 432.75120772946894], [2657.0, 159.89068322981387], [2641.0, 103.32989690721655], [2689.0, 110.70600000000002], [2705.0, 228.12763466042162], [2721.0, 64.24756189047251], [2737.0, 46.99054054054053], [2753.0, 830.4332247557005], [2801.0, 614.2303664921463], [2785.0, 214.2697074863656], [2769.0, 272.5482825664287], [2817.0, 49.108108108108105], [2833.0, 85.05263157894746], [2849.0, 272.2281808622505], [2865.0, 42.72045855379197], [2881.0, 280.2826310380262], [2929.0, 266.4475728155339], [2913.0, 70.23638344226586], [2897.0, 51.043526785714256], [2945.0, 51.286307053941975], [2961.0, 249.2243166823754], [2977.0, 51.7832080200501], [2993.0, 76.67346938775522], [3009.0, 91.0745856353592], [3057.0, 70.82785467128025], [3041.0, 511.28684907325726], [3025.0, 477.7518796992482], [3073.0, 91.27083333333331], [3089.0, 173.31311329170384], [3105.0, 80.04611330698286], [3121.0, 381.1907473309605], [3137.0, 99.54938271604938], [3153.0, 39.256944444444485], [3169.0, 217.64873949579805], [3185.0, 69.52958236658947], [3201.0, 73.90601813685088], [3217.0, 334.8195302843012], [3233.0, 1326.425845620121], [3249.0, 42.62728146013448], [3265.0, 362.07231690465204], [3281.0, 391.53986609859976], [3297.0, 85.04404567699848], [3313.0, 151.23093922651935], [3329.0, 83.25759162303666], [3345.0, 49.79515418502209], [3361.0, 40.45346320346321], [3377.0, 44.18660812294183], [3393.0, 107.05128205128194], [3409.0, 134.7435470441299], [3425.0, 81.03448275862068], [3441.0, 88.3337931034483], [3457.0, 83.74761904761905], [3473.0, 78.995785036881], [3489.0, 82.62678375411643], [3505.0, 70.1411764705882], [3521.0, 514.5311720698247], [3537.0, 91.55000000000011], [3553.0, 227.43277645186967], [3569.0, 86.53740648379046], [3585.0, 211.24178549287078], [3601.0, 97.84994964753274], [3617.0, 233.01327433628325], [3633.0, 66.30011520737321], [3649.0, 52.74309392265189], [3665.0, 568.8808593749993], [3681.0, 202.47114812611528], [3697.0, 41.06886227544913], [3713.0, 1004.5172413793103], [3729.0, 62.78707224334601], [3745.0, 130.3710037174721], [3761.0, 80.76404494382022], [3777.0, 81.56968215158919], [3793.0, 99.54446640316199], [3809.0, 36.69939183318851], [3825.0, 85.05660377358491], [3841.0, 135.05848291835548], [3857.0, 197.40540540540516], [3873.0, 150.5999999999998], [3889.0, 90.82205882352937], [3905.0, 93.06144393241168], [3921.0, 1997.7506527415187], [3937.0, 1097.285714285714], [3953.0, 46.36835278858624], [3969.0, 209.86823734729495], [3985.0, 211.05986903648264], [4001.0, 50.663348416289594], [4017.0, 249.85610347615213], [4033.0, 75.17890520694259], [4049.0, 49.62055016181222], [4065.0, 183.04289544235962], [4081.0, 457.8953488372086], [4098.0, 79.36421725239612], [4130.0, 957.5325858444286], [4162.0, 79.28151774785802], [4194.0, 483.5676077265971], [4226.0, 171.0923482849603], [4258.0, 265.57357679914077], [4290.0, 353.87245590230685], [4322.0, 370.5219298245615], [4354.0, 345.3184000000001], [4386.0, 40.52327935222671], [4418.0, 48.02921771913286], [4450.0, 71.11014492753627], [4482.0, 43.19314079422387], [4514.0, 41.313503305004765], [4546.0, 81.95300751879695], [4578.0, 87.15102040816325], [4610.0, 335.8642066420666], [4642.0, 222.9562450278436], [4674.0, 115.23943661971833], [4706.0, 119.56897837434772], [4738.0, 1154.7113095238096], [4770.0, 122.70115894039697], [4802.0, 482.9600380589914], [4834.0, 82.65207373271879], [4866.0, 70.49864682002719], [4898.0, 70.60914881297039], [4930.0, 280.2602965403626], [4962.0, 236.02352297593004], [4994.0, 353.19904761904786], [4099.0, 51.42240215924425], [4131.0, 83.53965785381024], [4163.0, 42.38011049723753], [4195.0, 87.42358974358979], [4227.0, 753.9817767653757], [4259.0, 174.90583232077788], [4291.0, 89.45138888888896], [4323.0, 67.27651515151516], [4355.0, 97.54179566563467], [4387.0, 186.2396576319541], [4419.0, 177.7507507507507], [4451.0, 42.15289256198344], [4483.0, 219.1463748290014], [4515.0, 243.84790011350717], [4547.0, 49.178467507274476], [4579.0, 485.8932291666666], [4611.0, 82.43329097839879], [4643.0, 109.26701570680628], [4675.0, 309.90680473372777], [4707.0, 87.27288135593213], [4739.0, 64.69485011529584], [4771.0, 39.829103214890054], [4803.0, 79.49851190476188], [4835.0, 325.5597014925374], [4867.0, 407.46782988004367], [4899.0, 200.83992805755403], [4931.0, 485.0707587382772], [4963.0, 273.5241009946445], [4995.0, 102.32318840579705], [1025.0, 112.7863354037267], [1049.0, 263.1826544021025], [1033.0, 118.69152787834894], [1057.0, 94.48887621220773], [1081.0, 74.4206974128234], [1073.0, 69.65934065934059], [1065.0, 87.58081133290378], [1041.0, 267.6167076167076], [1089.0, 58.787878787878775], [1113.0, 84.07109004739343], [1097.0, 111.3778801843319], [1121.0, 67.01530612244902], [1145.0, 318.3496932515338], [1137.0, 258.49602122015915], [1129.0, 74.37118644067792], [1105.0, 189.18326693227084], [1153.0, 96.99757281553386], [1177.0, 87.93989769820969], [1161.0, 142.30318602261053], [1185.0, 52.87053571428569], [1209.0, 188.20499108734396], [1201.0, 145.6587234042553], [1193.0, 103.54019073569484], [1169.0, 62.9460674157304], [1217.0, 134.77241379310354], [1241.0, 134.34608695652176], [1225.0, 203.53542009884677], [1249.0, 73.91291866028702], [1273.0, 86.53257790368266], [1265.0, 119.22494887525552], [1257.0, 94.00854700854701], [1233.0, 323.4757894736842], [1281.0, 80.05694117647066], [1305.0, 120.55418502202637], [1289.0, 205.4654696132597], [1313.0, 158.125], [1337.0, 92.03973509933788], [1329.0, 126.40769230769234], [1321.0, 132.25894134477824], [1297.0, 139.83443163097198], [1345.0, 139.2038547071904], [1369.0, 93.00000000000001], [1353.0, 160.1764705882353], [1377.0, 88.24521072796935], [1401.0, 78.51598173515993], [1393.0, 93.11070874288673], [1385.0, 53.13730158730156], [1361.0, 109.0445177246495], [1409.0, 178.37053571428564], [1433.0, 67.66563330380855], [1417.0, 78.90845070422542], [1441.0, 38.619640387275254], [1465.0, 354.7162629757786], [1457.0, 116.94323144104807], [1449.0, 192.37142857142854], [1425.0, 111.69748520710047], [1473.0, 42.433085501858706], [1497.0, 306.87189542483696], [1481.0, 302.6113636363635], [1505.0, 64.62011173184361], [1529.0, 273.5177111716621], [1521.0, 433.11961722488036], [1513.0, 198.11134453781517], [1489.0, 187.48206071757113], [1537.0, 289.2455642299507], [1545.0, 133.7715447154471], [1553.0, 58.38235294117644], [1561.0, 292.2025316455696], [1569.0, 102.1857555341674], [1593.0, 120.16015252621548], [1585.0, 203.29603960396057], [1577.0, 139.50393700787396], [1601.0, 214.01527272727282], [1609.0, 181.69447576099205], [1617.0, 171.14639397201285], [1625.0, 166.16339066339083], [1633.0, 391.2209150326797], [1657.0, 201.4009049773752], [1649.0, 59.39767441860465], [1641.0, 434.25552050473186], [1665.0, 53.61555312157718], [1673.0, 83.38471023427871], [1681.0, 503.87544483985744], [1689.0, 309.71850393700805], [1697.0, 56.22309197651665], [1721.0, 36.62350380848749], [1713.0, 58.89696169088508], [1705.0, 289.2146341463411], [1729.0, 269.0], [1737.0, 299.086956521739], [1745.0, 46.53076216712584], [1753.0, 40.157099697885215], [1761.0, 57.60116618075805], [1785.0, 264.8144531250004], [1777.0, 55.214463840398935], [1769.0, 60.30434782608694], [1793.0, 110.50910834132324], [1801.0, 69.90476190476187], [1809.0, 113.00664451827257], [1817.0, 55.3494623655914], [1825.0, 76.8283658787256], [1849.0, 93.65040650406505], [1841.0, 152.45033112582786], [1833.0, 52.84575389948004], [1857.0, 358.01420454545456], [1865.0, 199.48411214953296], [1873.0, 39.47872340425524], [1881.0, 169.09794988610477], [1889.0, 245.3042749371333], [1913.0, 32.379061371841175], [1905.0, 90.00104384133617], [1897.0, 152.2737676056336], [1921.0, 95.0954274353877], [1929.0, 80.16484517304185], [1937.0, 273.2279411764706], [1945.0, 69.72656249999999], [1953.0, 54.67989864864868], [1977.0, 81.02777777777784], [1969.0, 102.45533498759303], [1961.0, 92.70935130581292], [1985.0, 57.857805255023095], [1993.0, 153.49381818181794], [2001.0, 190.13916500994043], [2009.0, 103.74358974358981], [2017.0, 162.39583333333337], [2041.0, 140.2506203473946], [2033.0, 1761.980392156863], [2025.0, 133.41098901098897], [2050.0, 176.554780876494], [2066.0, 55.92264573991029], [2082.0, 124.58149779735689], [2098.0, 134.42835130970712], [2114.0, 54.51363636363643], [2162.0, 197.11153846153852], [2146.0, 2015.2075471698115], [2130.0, 186.39854486661292], [2178.0, 147.66852886405962], [2194.0, 257.2149532710281], [2210.0, 40.21379310344829], [2226.0, 127.07984790874542], [2242.0, 158.96510903426812], [2290.0, 48.28463203463206], [2274.0, 118.65673175745104], [2258.0, 819.1510416666664], [2306.0, 1764.4516129032256], [2322.0, 81.69298245614043], [2338.0, 308.85868498527964], [2354.0, 55.69793459552496], [2370.0, 105.2878535773711], [2418.0, 38.477459016393425], [2402.0, 287.6054421768705], [2386.0, 74.72463768115949], [2434.0, 75.81176470588237], [2450.0, 89.63687150837987], [2466.0, 270.3722222222224], [2482.0, 565.6034782608696], [2498.0, 194.67640094711928], [2546.0, 827.7032967032966], [2530.0, 47.5559038662487], [2514.0, 490.2583732057417], [2562.0, 85.25405405405408], [2578.0, 53.94417643004821], [2594.0, 37.43133462282398], [2610.0, 55.90443092962644], [2626.0, 674.2772277227723], [2674.0, 67.78390655418562], [2658.0, 71.90188679245273], [2642.0, 58.61981132075474], [2690.0, 33.10922112802149], [2706.0, 77.15524718126635], [2722.0, 276.55402750491123], [2738.0, 151.62690707350893], [2754.0, 74.24430379746833], [2802.0, 148.73416999429574], [2786.0, 263.6106870229009], [2770.0, 78.10245901639341], [2818.0, 119.37307871448539], [2834.0, 52.018669778296335], [2850.0, 87.73815165876785], [2866.0, 894.2231404958677], [2882.0, 80.75446960667455], [2930.0, 75.0971659919028], [2914.0, 42.67992047713717], [2898.0, 183.03826955074874], [2946.0, 294.08658922914515], [2962.0, 62.759633027522995], [2978.0, 331.8505747126431], [2994.0, 54.717095310136145], [3010.0, 41.00787401574795], [3058.0, 132.8690476190474], [3042.0, 426.2641700404857], [3026.0, 189.4502164502163], [3074.0, 55.37181528662417], [3090.0, 39.967703349282296], [3106.0, 242.23875870804343], [3122.0, 85.17968750000001], [3138.0, 40.08792270531402], [3154.0, 1620.0377358490566], [3170.0, 99.4352517985611], [3186.0, 171.3019607843138], [3202.0, 1497.8248638838497], [3218.0, 40.80058651026395], [3234.0, 154.088855421687], [3250.0, 962.3121387283237], [3266.0, 188.37970540098212], [3282.0, 202.42381786339757], [3298.0, 228.7666399358461], [3314.0, 88.79507278835382], [3330.0, 114.7499999999999], [3346.0, 519.2193548387097], [3362.0, 800.0937499999998], [3378.0, 734.7489082969428], [3394.0, 52.56143079315706], [3410.0, 36.349657198824715], [3426.0, 85.46172059984211], [3442.0, 37.37380952380952], [3458.0, 39.73858549686659], [3474.0, 46.09080841638972], [3490.0, 41.90304709141275], [3506.0, 51.9407337723424], [3522.0, 68.07259786476881], [3538.0, 40.58545797922575], [3554.0, 85.12959999999995], [3570.0, 48.84133915574965], [3586.0, 74.0485436893204], [3602.0, 209.7502321262762], [3618.0, 266.1836065573777], [3634.0, 252.7249488752556], [3650.0, 792.6797385620907], [3666.0, 96.26389776357841], [3682.0, 1110.5472636815914], [3698.0, 665.9642248722317], [3714.0, 2241.173249078461], [3730.0, 1047.9731182795697], [3746.0, 75.35721703011423], [3762.0, 307.38345473465137], [3778.0, 75.22456461961504], [3794.0, 100.94736842105253], [3810.0, 254.06356413166858], [3826.0, 55.0708955223879], [3842.0, 148.6672629695885], [3858.0, 33.18086500655311], [3874.0, 61.46865443425084], [3890.0, 39.67535287730723], [3906.0, 44.74618834080716], [3922.0, 68.60899653979236], [3938.0, 745.3533527696786], [3954.0, 1478.9791666666665], [3970.0, 180.47743813682672], [3986.0, 90.85797665369645], [4002.0, 777.7811080835618], [4018.0, 83.38766519823784], [4034.0, 158.47917961466757], [4050.0, 394.84666666666635], [4066.0, 72.23052208835327], [4082.0, 537.9853479853476], [4100.0, 4492.982993197279], [4132.0, 45.3161290322581], [4164.0, 719.3297362110322], [4196.0, 59.23741007194244], [4228.0, 80.35732647814913], [4260.0, 84.14942528735624], [4292.0, 43.75620975160985], [4324.0, 42.20377733598407], [4356.0, 351.6497041420118], [4388.0, 83.70573969280537], [4420.0, 83.87187666135034], [4452.0, 86.03100775193798], [4484.0, 114.23404255319144], [4516.0, 78.33122629582813], [4548.0, 624.6930946291557], [4580.0, 62.78438899552137], [4612.0, 1021.805031446541], [4644.0, 73.62707468879661], [4676.0, 57.22796352583585], [4708.0, 48.71199244570353], [4740.0, 351.8982725527831], [4772.0, 3592.43949044586], [4804.0, 122.07857911733056], [4836.0, 893.0140148392404], [4868.0, 130.24180327868868], [4900.0, 107.32690124858112], [4932.0, 146.72019230769234], [4964.0, 36.81735985533455], [4996.0, 39.488687782805464], [4101.0, 107.35957696827252], [4133.0, 201.72428694900583], [4165.0, 563.3450905624405], [4197.0, 102.37338262476901], [4229.0, 203.32715477293783], [4261.0, 303.56151142355], [4293.0, 408.75079365079404], [4325.0, 721.2731958762885], [4357.0, 72.08853754940706], [4389.0, 132.55406162465002], [4421.0, 62.847913862718734], [4453.0, 192.6332247557002], [4485.0, 57.90165745856358], [4517.0, 44.12165775401065], [4549.0, 356.6512749827716], [4581.0, 251.37759336099552], [4613.0, 80.8005098789036], [4645.0, 63.695810564662935], [4677.0, 266.02631578947376], [4709.0, 182.01903367496325], [4741.0, 118.54611211573238], [4773.0, 186.9843037974683], [4805.0, 92.57971014492763], [4837.0, 213.6707142857145], [4869.0, 506.41134751773006], [4901.0, 78.77961432506892], [4933.0, 185.32911392405026], [4965.0, 9537.630727762808], [4997.0, 184.83665338645415], [2051.0, 93.72594142259413], [2067.0, 122.9], [2083.0, 44.26661129568106], [2099.0, 779.6694214876032], [2115.0, 172.42040038131563], [2163.0, 181.81451612903226], [2147.0, 53.16774716369526], [2131.0, 40.35157545605314], [2179.0, 218.44683026584872], [2195.0, 239.05114029025546], [2211.0, 300.4174757281553], [2227.0, 69.26770538243618], [2243.0, 139.26213592233012], [2291.0, 179.37962037962038], [2275.0, 118.03240740740748], [2259.0, 103.19019607843131], [2307.0, 166.35857908847237], [2323.0, 207.9935779816514], [2339.0, 65.93084522502735], [2355.0, 185.57295081967214], [2371.0, 213.25401069518722], [2419.0, 243.8127272727274], [2403.0, 86.64820213799797], [2387.0, 158.11821705426368], [2435.0, 161.77639155470263], [2451.0, 61.34315286624204], [2467.0, 88.13723284589435], [2483.0, 445.4504504504505], [2499.0, 186.77272727272722], [2547.0, 119.29857231533195], [2531.0, 1413.8400000000001], [2515.0, 86.7004716981132], [2563.0, 132.7006960556842], [2579.0, 154.9089506172837], [2595.0, 208.2694198623403], [2611.0, 296.2068965517241], [2627.0, 54.035731530661515], [2675.0, 173.28663967611337], [2659.0, 135.98967741935493], [2643.0, 74.00956175298789], [2691.0, 339.37892791127587], [2707.0, 41.57160963244612], [2723.0, 71.84043927648587], [2739.0, 52.16375198728137], [2755.0, 366.9593345656195], [2803.0, 122.52883762200544], [2787.0, 82.12731871838109], [2771.0, 140.0975378787879], [2819.0, 548.5291181364403], [2835.0, 198.31643625192004], [2851.0, 38.73233404710925], [2867.0, 69.1857923497268], [2883.0, 40.27205100956424], [2931.0, 56.283434650455966], [2915.0, 386.3712784588441], [2899.0, 72.29335260115603], [2947.0, 65.80965147453078], [2963.0, 69.6235632183908], [2979.0, 59.65711556829031], [2995.0, 551.561475409836], [3011.0, 80.85106382978724], [3059.0, 76.63954802259877], [3043.0, 155.02960102960114], [3027.0, 54.814075630252155], [3075.0, 207.77398015435497], [3091.0, 49.61309523809527], [3107.0, 69.80326197757404], [3123.0, 162.56742815033164], [3139.0, 315.10618556701036], [3155.0, 116.02119565217357], [3171.0, 44.53701211305518], [3187.0, 90.65384615384627], [3203.0, 85.91432396251672], [3219.0, 219.1609467455622], [3235.0, 131.80344827586202], [3251.0, 191.28625093914357], [3267.0, 43.747191011236], [3283.0, 182.89888682745817], [3299.0, 84.78477306002931], [3315.0, 159.7779690189333], [3331.0, 129.41960038058994], [3347.0, 74.82086956521738], [3363.0, 115.09844868735095], [3379.0, 68.9235150528886], [3395.0, 406.0480480480479], [3411.0, 499.49365942028925], [3427.0, 43.165381319622924], [3443.0, 197.04222972972966], [3459.0, 245.10273972602735], [3475.0, 68.34863523573192], [3491.0, 312.7889655172415], [3507.0, 241.36451048951014], [3523.0, 145.33773784355148], [3539.0, 244.2805059523807], [3555.0, 41.588688946015374], [3571.0, 279.0763747454175], [3587.0, 49.594565217391285], [3603.0, 176.06652126499455], [3619.0, 70.60465116279069], [3635.0, 90.58603896103897], [3651.0, 2613.513201320133], [3667.0, 376.9876390605683], [3683.0, 45.78555304740407], [3699.0, 75.30010070493451], [3715.0, 215.12456747404877], [3731.0, 180.03810623556532], [3747.0, 35.81659388646284], [3763.0, 383.8818897637803], [3779.0, 455.0469798657716], [3795.0, 40.42640499553964], [3811.0, 83.1570247933884], [3827.0, 372.115955473099], [3843.0, 73.95898673100125], [3859.0, 369.23104434907026], [3875.0, 488.64169381107513], [3891.0, 136.6], [3907.0, 395.16918429002953], [3923.0, 44.255670103092775], [3939.0, 433.80308529945574], [3955.0, 234.82978723404284], [3971.0, 85.97967479674799], [3987.0, 42.54677060133629], [4003.0, 97.75464684014867], [4019.0, 59.129992737835764], [4035.0, 98.72852233676979], [4051.0, 73.89082638362382], [4067.0, 297.8861180382382], [4083.0, 95.76201372997704], [4102.0, 171.55245189323423], [4134.0, 101.68218298555374], [4166.0, 46.61170731707316], [4198.0, 309.5895196506551], [4230.0, 131.20231213872833], [4262.0, 85.65472779369627], [4294.0, 84.48712667353252], [4326.0, 71.41819515774012], [4358.0, 320.29174664107484], [4390.0, 95.87570621468925], [4422.0, 325.05400981996655], [4454.0, 43.566362715298844], [4486.0, 60.78389830508477], [4518.0, 266.40524781341134], [4550.0, 479.94935854152646], [4582.0, 91.02455357142851], [4614.0, 710.9377990430622], [4646.0, 93.02818270165209], [4678.0, 69.6103379721671], [4710.0, 78.23996350364966], [4742.0, 46.013671875000014], [4774.0, 134.4725370531823], [4806.0, 60.22784810126585], [4838.0, 99.93877551020412], [4870.0, 1516.0862865947613], [4902.0, 229.98845470692737], [4934.0, 41.716253443526206], [4966.0, 154.25671641791038], [4998.0, 1523.607277289835], [4103.0, 101.8366013071896], [4135.0, 45.230401529636715], [4167.0, 216.685534591195], [4199.0, 70.4359654943598], [4231.0, 894.7008244994107], [4263.0, 105.2067961165052], [4295.0, 90.37670609645139], [4327.0, 43.13892078071178], [4359.0, 65.15909090909089], [4391.0, 46.77742279020233], [4423.0, 47.97199533255537], [4455.0, 304.1913875598087], [4487.0, 340.19945355191277], [4519.0, 75.76776649746196], [4551.0, 330.429054054054], [4583.0, 96.49493487698989], [4615.0, 272.9538461538459], [4647.0, 58.00080710250201], [4679.0, 62.153753026634355], [4711.0, 53.979525862069], [4743.0, 248.66055776892463], [4775.0, 79.45875542691745], [4807.0, 195.22307692307686], [4839.0, 134.004481434059], [4871.0, 146.90054744525563], [4903.0, 106.93394308943078], [4935.0, 661.855855855856], [4967.0, 174.19787408013056], [4999.0, 342.4734513274335], [513.0, 27.285846438482892], [525.0, 50.97210300429183], [517.0, 58.070050761421314], [541.0, 92.73828756058164], [537.0, 91.41119063109954], [529.0, 25.745945945945927], [533.0, 36.40529247910866], [521.0, 36.50769230769231], [545.0, 23.75655737704917], [557.0, 32.2933042212518], [549.0, 97.07090719499476], [573.0, 51.58221476510072], [569.0, 93.59128289473692], [561.0, 142.42614770459082], [565.0, 1342.9058823529413], [553.0, 50.04323308270673], [577.0, 23.868725868725864], [589.0, 88.10818713450297], [581.0, 72.79545454545453], [605.0, 48.9072243346008], [601.0, 44.4043010752688], [593.0, 79.57781324820428], [597.0, 37.00825309491051], [585.0, 284.42477876106193], [609.0, 29.162162162162183], [621.0, 244.5810055865922], [613.0, 82.38541666666666], [637.0, 1781.3529411764705], [633.0, 134.60959409594096], [625.0, 41.81993204983014], [629.0, 245.15255813953485], [617.0, 63.45728965960183], [641.0, 43.586049543676765], [653.0, 148.83206106870227], [645.0, 67.50247279920872], [669.0, 170.4385285575993], [665.0, 86.8828671328671], [657.0, 125.94419134396357], [661.0, 68.06053811659194], [649.0, 39.97530864197533], [673.0, 87.1267874165872], [685.0, 61.46656976744197], [677.0, 55.294532627865976], [701.0, 54.96631736526947], [697.0, 67.04132231404962], [689.0, 116.45784883720933], [693.0, 93.8657298985168], [681.0, 69.7133757961783], [705.0, 268.87730061349697], [717.0, 34.989339019189806], [709.0, 50.32327586206895], [733.0, 50.0395622895623], [729.0, 130.5433333333333], [721.0, 278.9445628997868], [725.0, 46.72327044025155], [713.0, 408.13911290322585], [737.0, 36.9778534923339], [749.0, 40.73985431841834], [741.0, 306.7013574660633], [765.0, 46.446428571428584], [761.0, 92.95982142857144], [753.0, 257.92565055762077], [757.0, 84.79865395401009], [745.0, 51.91961607678459], [769.0, 91.53904630269527], [781.0, 68.94581280788185], [773.0, 35.59238095238094], [797.0, 87.63352272727276], [793.0, 99.314705882353], [785.0, 44.37237977805182], [789.0, 84.24266144814098], [777.0, 146.84115523465704], [801.0, 438.34013605442175], [813.0, 100.10526315789477], [805.0, 97.50397614314117], [829.0, 74.35793871866298], [825.0, 104.97777777777782], [817.0, 157.13550420168073], [821.0, 295.203233256351], [809.0, 49.408523908523875], [833.0, 51.36749633967792], [845.0, 87.70382978723399], [837.0, 65.20331651045404], [861.0, 38.27466666666668], [857.0, 111.57971014492762], [849.0, 81.05700325732896], [853.0, 167.45724465558192], [841.0, 67.7585616438356], [865.0, 54.013717421124824], [877.0, 149.77618243243236], [869.0, 402.6386554621849], [893.0, 59.446608462055096], [889.0, 181.76528117359416], [881.0, 85.72250859106519], [885.0, 234.57489878542526], [873.0, 106.83812405446305], [897.0, 361.1321739130434], [909.0, 108.32867883995712], [901.0, 92.70129870129865], [925.0, 168.8899159663864], [921.0, 132.7225656877898], [913.0, 66.9799537393987], [917.0, 255.69369369369366], [905.0, 67.45454545454545], [929.0, 174.2267365661861], [941.0, 34.66448801742922], [933.0, 97.73670886075953], [957.0, 83.29379310344824], [953.0, 77.45599999999993], [945.0, 52.66222961730449], [949.0, 93.22545090180363], [937.0, 126.47769230769224], [961.0, 81.2723577235772], [973.0, 93.86399427344308], [965.0, 2032.6666666666667], [989.0, 109.42035928143726], [985.0, 39.05726872246703], [977.0, 193.6924198250729], [981.0, 1945.2903225806451], [969.0, 143.73512476007676], [993.0, 52.09947643979058], [1005.0, 542.5842105263158], [997.0, 60.83199415631852], [1021.0, 312.00454545454545], [1017.0, 87.044962531224], [1009.0, 95.05895691609973], [1013.0, 77.73821989528794], [1001.0, 90.14999999999995], [1026.0, 107.21447028423783], [1050.0, 140.96436781609196], [1034.0, 49.51022864019255], [1082.0, 207.49420849420844], [1074.0, 97.20336503291885], [1058.0, 63.87037037037036], [1066.0, 46.66485310119703], [1042.0, 147.1991447770312], [1090.0, 194.0], [1114.0, 84.05231788079467], [1098.0, 80.00937866354046], [1146.0, 108.24066390041487], [1138.0, 72.50481695568399], [1122.0, 188.55610236220477], [1130.0, 47.74724172517556], [1106.0, 108.27634487840834], [1154.0, 112.4956616052061], [1178.0, 144.438202247191], [1162.0, 302.5038910505836], [1210.0, 5295.909090909091], [1202.0, 67.70103092783508], [1186.0, 229.60526315789474], [1194.0, 89.05000000000001], [1170.0, 119.3360465116279], [1218.0, 559.0743801652893], [1242.0, 106.99440447641877], [1226.0, 64.14303104077906], [1274.0, 58.32978723404255], [1266.0, 65.70373665480409], [1250.0, 136.0834141610087], [1258.0, 155.38297872340414], [1234.0, 119.73179241168778], [1282.0, 149.67070707070724], [1306.0, 117.61510353227769], [1290.0, 115.23056057866195], [1338.0, 370.75765306122446], [1330.0, 57.27692307692307], [1314.0, 142.62795477903398], [1322.0, 239.23085339168506], [1298.0, 84.6923076923077], [1346.0, 269.01223241590213], [1370.0, 126.61597938144331], [1354.0, 168.86651053864176], [1402.0, 1019.3476439790576], [1394.0, 101.113782051282], [1378.0, 134.2662538699691], [1386.0, 176.12551724137938], [1362.0, 88.46641318124207], [1410.0, 68.52075471698106], [1434.0, 84.14695340501791], [1418.0, 101.92391304347835], [1466.0, 98.64017800381427], [1458.0, 161.19692489651084], [1442.0, 139.3689126084056], [1450.0, 157.50852272727263], [1426.0, 83.92956656346732], [1474.0, 255.7594501718213], [1498.0, 62.11420612813368], [1482.0, 118.8833208676142], [1530.0, 107.75125089349528], [1522.0, 65.48968729208238], [1506.0, 34.56905594405583], [1514.0, 84.16571892770102], [1490.0, 83.174959871589], [1538.0, 522.2253521126761], [1546.0, 76.21619047619049], [1554.0, 131.93966282165042], [1562.0, 99.93365853658541], [1570.0, 87.6176911544228], [1594.0, 119.14060742407196], [1586.0, 134.8723702664796], [1578.0, 101.23482849604234], [1602.0, 49.98686371100159], [1610.0, 86.5952380952381], [1618.0, 710.2857142857152], [1626.0, 237.46985446985448], [1634.0, 86.16583629893228], [1658.0, 86.3118279569893], [1650.0, 229.73734177215186], [1642.0, 76.19070041200693], [1666.0, 4885.5], [1674.0, 47.984547461368656], [1682.0, 129.00526777875316], [1690.0, 142.42253521126764], [1698.0, 76.44144144144138], [1722.0, 44.7038461538462], [1714.0, 41.68857142857142], [1706.0, 152.10000000000002], [1730.0, 78.52196836555358], [1738.0, 87.95022624434391], [1746.0, 67.5103825136612], [1754.0, 335.9676870748301], [1762.0, 209.94705174488556], [1786.0, 91.75117370892025], [1778.0, 232.52026286966117], [1770.0, 240.8028169014084], [1794.0, 192.8020446096657], [1802.0, 182.5962399283795], [1810.0, 130.67632850241546], [1818.0, 466.58105646630236], [1826.0, 275.7719962157048], [1850.0, 132.238359201774], [1842.0, 51.52397558849171], [1834.0, 145.44645799011514], [1858.0, 128.01565836298926], [1866.0, 110.49218750000003], [1874.0, 161.70524017467253], [1882.0, 42.06322957198436], [1890.0, 158.62162162162167], [1914.0, 136.56445739257111], [1906.0, 287.04374999999993], [1898.0, 131.40273972602736], [1922.0, 116.3583138173303], [1930.0, 54.98764160659116], [1938.0, 112.64150943396194], [1946.0, 206.3302277432713], [1954.0, 151.93586875466085], [1978.0, 90.17505720823807], [1970.0, 38.395759717314455], [1962.0, 49.89575971731445], [1986.0, 215.1408695652173], [1994.0, 57.46908315565034], [2002.0, 66.0602975724356], [2010.0, 51.71122112211219], [2018.0, 201.95442359249392], [2042.0, 114.36949516648762], [2034.0, 83.62618873445504], [2026.0, 76.62143354210156], [2052.0, 45.499499499499585], [2068.0, 141.97880794701982], [2084.0, 291.5537790697672], [2100.0, 54.14624277456632], [2116.0, 100.4678899082568], [2164.0, 646.9245283018868], [2148.0, 415.2859374999997], [2132.0, 147.03559657218202], [2180.0, 93.64478764478761], [2196.0, 187.55137481910282], [2212.0, 100.92554991539762], [2228.0, 50.32673267326728], [2244.0, 62.503355704697995], [2292.0, 87.23550724637678], [2276.0, 702.2708333333333], [2260.0, 55.39955357142857], [2308.0, 75.45848708487078], [2324.0, 241.40047581284668], [2340.0, 163.1896551724138], [2356.0, 103.01446654611205], [2372.0, 94.94988610478356], [2420.0, 76.7937219730942], [2404.0, 64.75321637426904], [2388.0, 116.37943925233641], [2436.0, 81.45364238410595], [2452.0, 513.5208711433746], [2468.0, 46.401315789473706], [2484.0, 53.85584415584417], [2500.0, 157.5881763527054], [2548.0, 158.6571428571429], [2532.0, 183.27058823529407], [2516.0, 159.07447864945382], [2564.0, 34.040665434380806], [2580.0, 39.23956931359356], [2596.0, 79.74289772727275], [2612.0, 153.80059347181006], [2628.0, 296.73274780426607], [2676.0, 82.74898785425098], [2660.0, 80.46081871345041], [2644.0, 57.75000000000001], [2692.0, 53.42418772563179], [2708.0, 340.0747663551405], [2724.0, 439.11487481590575], [2740.0, 223.9672591206733], [2756.0, 88.92842535787328], [2804.0, 75.26405090137847], [2788.0, 42.888776541961604], [2772.0, 80.56214689265546], [2820.0, 74.46003717472125], [2836.0, 79.5873417721518], [2852.0, 1508.7381615598886], [2868.0, 51.90869086908687], [2884.0, 124.68604651162795], [2932.0, 195.5385779122541], [2916.0, 79.66342756183762], [2900.0, 37.40836940836938], [2948.0, 40.317659352142066], [2964.0, 252.11333333333346], [2980.0, 51.30813953488369], [2996.0, 86.06006493506493], [3012.0, 229.97595034910742], [3060.0, 39.87652811735942], [3044.0, 51.87757731958771], [3028.0, 2249.181818181819], [3076.0, 83.57549504950502], [3092.0, 149.9018691588788], [3108.0, 196.97468354430376], [3124.0, 86.91201716738198], [3140.0, 80.86681974741681], [3156.0, 270.01603773584907], [3172.0, 1417.8769230769217], [3188.0, 38.876923076923056], [3204.0, 46.14913448735019], [3220.0, 132.79335793357905], [3236.0, 180.94577006507592], [3252.0, 159.33043478260865], [3268.0, 167.75576814856504], [3284.0, 36.79999999999994], [3300.0, 54.734109221128016], [3316.0, 81.4176245210728], [3332.0, 42.52614896988908], [3348.0, 123.80929095354516], [3364.0, 194.47623762376233], [3380.0, 46.11662315056566], [3396.0, 76.41520467836264], [3412.0, 81.52188552188564], [3428.0, 623.8421052631579], [3444.0, 78.35443037974693], [3460.0, 108.42036708111335], [3476.0, 65.74706867671685], [3492.0, 72.91868758915828], [3508.0, 91.42825112107623], [3524.0, 108.03755868544604], [3540.0, 72.20775623268699], [3556.0, 280.1446593776282], [3572.0, 75.91284403669715], [3588.0, 205.73834679925415], [3604.0, 269.4532751091701], [3620.0, 86.5726375176305], [3636.0, 43.612511671335206], [3652.0, 189.80085653104908], [3668.0, 71.64220183486233], [3684.0, 563.5323741007194], [3700.0, 44.404586404586375], [3716.0, 92.7848837209302], [3732.0, 122.92640186915887], [3748.0, 339.2153846153846], [3764.0, 47.05952380952375], [3780.0, 63.568413886997895], [3796.0, 338.17976318622203], [3812.0, 52.44675540765388], [3828.0, 79.17619493908151], [3844.0, 45.12322791712103], [3860.0, 106.94403892944041], [3876.0, 40.33433133732539], [3892.0, 69.37034434293753], [3908.0, 29.11298482293423], [3924.0, 1143.84649122807], [3940.0, 81.5374149659864], [3956.0, 175.23142669296513], [3972.0, 109.3871439006574], [3988.0, 66.0282186948853], [4004.0, 222.58702702702698], [4020.0, 296.3779160186624], [4036.0, 42.992907801418504], [4052.0, 221.68197879858647], [4068.0, 88.94962686567169], [4084.0, 97.02242424242414], [4104.0, 47.05490196078432], [4136.0, 560.6454545454546], [4168.0, 78.84311632870863], [4200.0, 167.1651893634165], [4232.0, 180.1653225806452], [4264.0, 2057.583979328167], [4296.0, 413.1999999999999], [4328.0, 166.82631578947365], [4360.0, 173.41686555290372], [4392.0, 302.7552742616039], [4424.0, 230.4674012855828], [4456.0, 135.2908067542213], [4488.0, 42.80021141649048], [4520.0, 50.26633165829143], [4552.0, 79.75277572168758], [4584.0, 128.12756052141538], [4616.0, 154.41253051261188], [4648.0, 40.884726224783876], [4680.0, 979.5135699373687], [4712.0, 194.27042801556422], [4744.0, 101.8264058679707], [4776.0, 40.617808219178066], [4808.0, 113.23364485981305], [4840.0, 69.70245398773008], [4872.0, 241.07585644371912], [4904.0, 156.81077348066307], [4936.0, 72.05727554179575], [4968.0, 132.5107604017216], [5000.0, 304.18160337743353], [4105.0, 270.9660231660228], [4137.0, 207.8448185165704], [4169.0, 98.28027681660896], [4201.0, 92.86644407345564], [4233.0, 80.25439999999999], [4265.0, 1885.6995486782687], [4297.0, 106.08808290155444], [4329.0, 386.757643549591], [4361.0, 71.21731448763241], [4393.0, 89.44019138755982], [4425.0, 77.61082737487226], [4457.0, 49.94955156950675], [4489.0, 50.64433617539586], [4521.0, 207.55205047318617], [4553.0, 569.1842751842752], [4585.0, 53.799660441426184], [4617.0, 65.246013667426], [4649.0, 1472.4319478402601], [4681.0, 1102.8077682686], [4713.0, 74.08365508365507], [4745.0, 62.817763157894646], [4777.0, 90.11194029850742], [4809.0, 323.34552332913006], [4841.0, 41.8546666666667], [4873.0, 139.47994825355767], [4905.0, 100.69444444444451], [4937.0, 82.90590979782264], [4969.0, 49.391061452513966], [2053.0, 782.1599999999999], [2069.0, 56.3091095189355], [2085.0, 113.09512761020882], [2101.0, 524.295719844358], [2117.0, 63.90691489361708], [2165.0, 254.08250355618762], [2149.0, 210.43841059602647], [2133.0, 89.5044404973357], [2181.0, 33.848993288590606], [2197.0, 106.48697916666679], [2213.0, 35.57261029411768], [2229.0, 2318.0], [2245.0, 318.52749490835043], [2293.0, 62.507092198581546], [2277.0, 55.05227882037534], [2261.0, 162.8849085365854], [2309.0, 742.3068783068782], [2325.0, 86.95114942528737], [2341.0, 271.023414634146], [2357.0, 52.73704663212439], [2373.0, 137.72755102040816], [2421.0, 52.94972826086962], [2405.0, 214.4035087719298], [2389.0, 131.7310606060606], [2437.0, 68.42790697674407], [2453.0, 169.50588235294117], [2469.0, 101.71428571428588], [2485.0, 354.76018396846223], [2501.0, 109.01372756071802], [2549.0, 180.40062843676375], [2533.0, 60.79030144167767], [2517.0, 77.51266464032419], [2565.0, 152.60993337371292], [2581.0, 170.5437553101102], [2597.0, 39.26339794754847], [2613.0, 51.66735966735968], [2629.0, 69.61454545454538], [2677.0, 45.48312375909988], [2661.0, 46.530351437699636], [2645.0, 153.19134615384627], [2693.0, 247.04074402125786], [2709.0, 78.13388259526252], [2725.0, 135.46810810810814], [2741.0, 83.71604938271605], [2757.0, 80.39544344995929], [2805.0, 54.634418604651195], [2789.0, 119.62383177570088], [2773.0, 59.61855670103088], [2821.0, 42.210320562939785], [2837.0, 46.797883597883605], [2853.0, 136.96498599439815], [2869.0, 822.2708333333336], [2885.0, 194.47396138092483], [2933.0, 259.52583025830256], [2917.0, 264.28772189349104], [2901.0, 282.70653266331675], [2949.0, 181.96071428571426], [2965.0, 195.2866817155755], [2981.0, 236.3294117647059], [2997.0, 203.95783132530124], [3013.0, 42.98599999999996], [3061.0, 274.6151079136691], [3045.0, 250.82794676806085], [3029.0, 231.96686264029972], [3077.0, 42.077669902912604], [3093.0, 139.91019955654116], [3109.0, 85.11538461538457], [3125.0, 54.329766536964854], [3141.0, 45.68004338394792], [3157.0, 90.35838150289014], [3173.0, 81.88631578947368], [3189.0, 260.9555035128805], [3205.0, 233.94712430426728], [3221.0, 50.17404580152669], [3237.0, 242.9972811310492], [3253.0, 323.77361853832446], [3269.0, 9138.246575342468], [3285.0, 879.7307692307693], [3301.0, 182.1880597014925], [3317.0, 172.08348909657306], [3333.0, 175.33170334148346], [3349.0, 92.18199608610571], [3365.0, 83.20633299284981], [3381.0, 7115.600000000001], [3397.0, 47.639448568398734], [3413.0, 45.81358024691358], [3429.0, 99.30946157867194], [3445.0, 46.04743083003946], [3461.0, 52.33369330453562], [3477.0, 45.896551724137936], [3493.0, 75.50859106529198], [3509.0, 37.74441964285713], [3525.0, 45.86131386861312], [3541.0, 38.57785467128026], [3557.0, 89.57466063348411], [3573.0, 51.03699421965318], [3589.0, 393.0760869565215], [3605.0, 30.291089108910885], [3621.0, 403.43939393939394], [3637.0, 905.981351981352], [3653.0, 35.572127139364284], [3669.0, 47.73310810810812], [3685.0, 113.04246153846147], [3701.0, 527.6466666666666], [3717.0, 55.68271507498027], [3733.0, 294.68209134615324], [3749.0, 290.79620302208446], [3765.0, 1001.783999999999], [3781.0, 194.31040669856466], [3797.0, 63.350835322195735], [3813.0, 115.10697977821262], [3829.0, 311.51545311681497], [3845.0, 151.2632249840663], [3861.0, 53.55441302485005], [3877.0, 863.7713523131677], [3893.0, 145.609433962264], [3909.0, 56.9625615763547], [3925.0, 213.0225694444444], [3941.0, 38.24643584521385], [3957.0, 92.86398763523962], [3973.0, 38.23669467787113], [3989.0, 372.7275064267356], [4005.0, 97.86666666666663], [4021.0, 69.57558945908457], [4037.0, 224.82899628252775], [4053.0, 83.4748923959829], [4069.0, 49.92394822006474], [4085.0, 77.1122448979591], [4106.0, 139.6618852459016], [4138.0, 216.13493800145895], [4170.0, 75.14600550964181], [4202.0, 61.31751824817519], [4234.0, 36.9109109109109], [4266.0, 602.015727391874], [4298.0, 188.33184523809518], [4330.0, 41.663148636763424], [4362.0, 44.07417840375582], [4394.0, 163.1056701030925], [4426.0, 141.227498228207], [4458.0, 716.8060109289617], [4490.0, 673.7821522309715], [4522.0, 60.83946251768036], [4554.0, 67.51405325443775], [4586.0, 504.57639939485597], [4618.0, 161.56295224312615], [4650.0, 407.6363636363636], [4682.0, 227.6598360655739], [4714.0, 127.61619190404828], [4746.0, 260.551330798479], [4778.0, 63.85786802030467], [4810.0, 83.39612188365653], [4842.0, 46.67595459236324], [4874.0, 112.68549701249313], [4906.0, 41.664068589243875], [4938.0, 96.53017241379314], [4970.0, 272.9724025974025], [4107.0, 53.79982126899017], [4139.0, 113.31477516059952], [4171.0, 39.14911080711353], [4203.0, 80.32392273402681], [4235.0, 843.0311418685118], [4267.0, 75.77153110047846], [4299.0, 92.22935779816505], [4331.0, 727.71875], [4363.0, 313.84], [4395.0, 222.3231756214919], [4427.0, 76.56737588652479], [4459.0, 91.22190408017171], [4491.0, 233.3858165256994], [4523.0, 49.50804597701149], [4555.0, 47.71108622620377], [4587.0, 82.44318181818178], [4619.0, 118.34899328859069], [4651.0, 180.41162790697695], [4683.0, 166.34646194926557], [4715.0, 981.2570281124496], [4747.0, 98.0191304347828], [4779.0, 42.61018957345971], [4811.0, 118.01703163017027], [4843.0, 588.9230769230769], [4875.0, 104.18666666666665], [4907.0, 1131.6279069767454], [4939.0, 54.089041095890416], [4971.0, 68.68366592756834], [1027.0, 239.6276849642005], [1051.0, 72.94688026981447], [1035.0, 126.13880445795344], [1083.0, 67.415201361316], [1075.0, 240.01999999999998], [1059.0, 142.9466019417476], [1067.0, 137.84201235657554], [1043.0, 68.8267716535433], [1091.0, 67.83269598470363], [1115.0, 1342.1521739130435], [1099.0, 62.5061648280337], [1147.0, 87.20408163265309], [1139.0, 114.85115483319072], [1123.0, 133.69929364278522], [1131.0, 137.96774193548384], [1107.0, 194.4114173228346], [1155.0, 267.4775280898877], [1179.0, 107.1066931742878], [1163.0, 86.31379310344826], [1211.0, 103.82397782397794], [1203.0, 107.91343552750229], [1187.0, 139.6336633663366], [1195.0, 123.80730380730378], [1171.0, 106.74356333676619], [1219.0, 96.48782093482549], [1243.0, 125.53206002728516], [1227.0, 176.96765734265736], [1275.0, 126.59108527131795], [1267.0, 213.5239206534422], [1251.0, 73.41076923076925], [1259.0, 76.74595623215981], [1235.0, 94.00000000000001], [1283.0, 141.58325123152707], [1307.0, 136.58573853989805], [1291.0, 388.3433734939759], [1339.0, 93.14315937940759], [1331.0, 140.12324794586763], [1315.0, 49.11171960569552], [1323.0, 70.48333333333328], [1299.0, 61.130749014454835], [1347.0, 59.86129266521432], [1371.0, 158.59881422924892], [1355.0, 147.9152334152334], [1403.0, 45.001154734411124], [1395.0, 39.746666666666684], [1379.0, 79.49289099526065], [1387.0, 101.61511423550103], [1363.0, 106.47394296951829], [1411.0, 103.68246153846142], [1435.0, 135.28599605522686], [1419.0, 134.51898734177212], [1467.0, 51.21682847896442], [1459.0, 78.84131736526942], [1443.0, 128.41764705882343], [1451.0, 119.0087045570917], [1427.0, 139.6034482758621], [1475.0, 144.9584775086506], [1499.0, 60.863636363636346], [1483.0, 41.086419753086496], [1531.0, 155.5133333333333], [1523.0, 51.805208333333304], [1507.0, 105.03162055335969], [1515.0, 60.759868421052666], [1491.0, 205.30712979890308], [1539.0, 134.7906976744186], [1547.0, 204.32146490335685], [1555.0, 209.51622418879057], [1563.0, 197.1163387510692], [1571.0, 51.0638440860215], [1595.0, 65.86155285313379], [1587.0, 49.76182136602455], [1579.0, 107.41207627118648], [1603.0, 167.07601880877732], [1611.0, 141.42672919109023], [1619.0, 127.7339055793991], [1627.0, 68.5671918443003], [1635.0, 200.49081007488084], [1659.0, 113.96692392502757], [1651.0, 111.69487179487193], [1643.0, 229.22063037249285], [1667.0, 162.70168539325857], [1675.0, 498.5209003215434], [1683.0, 114.07522123893804], [1691.0, 98.27517985611517], [1699.0, 250.36697247706417], [1723.0, 195.5399495374267], [1715.0, 165.8831168831168], [1707.0, 58.13420316868594], [1731.0, 46.03518123667374], [1739.0, 52.417620137299785], [1747.0, 282.4962962962968], [1755.0, 59.061559507523995], [1763.0, 230.99708029197066], [1787.0, 257.44842406876813], [1779.0, 68.53764861294584], [1771.0, 85.9577167019028], [1795.0, 120.55459770114942], [1803.0, 101.6921397379913], [1811.0, 110.19068736141914], [1819.0, 74.37202152190622], [1827.0, 141.77322404371586], [1851.0, 108.49533799533802], [1843.0, 70.02045454545451], [1835.0, 102.24798387096784], [1859.0, 47.50907354345751], [1867.0, 59.71983914209112], [1875.0, 132.96418473138544], [1883.0, 165.47146401985077], [1891.0, 528.4914048606993], [1915.0, 218.13333333333344], [1907.0, 120.332972972973], [1899.0, 61.359375000000014], [1923.0, 102.93548387096774], [1931.0, 204.9758745476477], [1939.0, 58.999999999999986], [1947.0, 53.6769547325103], [1955.0, 119.20857142857146], [1979.0, 44.42720763723142], [1971.0, 155.91999999999973], [1963.0, 574.2876712328767], [1987.0, 136.8844301765649], [1995.0, 216.86121323529412], [2003.0, 141.72773972602732], [2011.0, 69.31445702864747], [2019.0, 145.73870967741948], [2043.0, 71.61767728674204], [2035.0, 156.94630872483222], [2027.0, 241.74964838255977], [2054.0, 81.84701284198754], [2070.0, 2955.1957671957666], [2086.0, 46.52578361981802], [2102.0, 144.49025769955992], [2118.0, 82.1253263707573], [2166.0, 189.09304932735415], [2150.0, 72.21839080459766], [2134.0, 158.4475655430712], [2182.0, 274.99348109517604], [2198.0, 40.39650145772591], [2214.0, 359.98043254376927], [2230.0, 191.9537572254333], [2246.0, 83.33293269230772], [2294.0, 391.4979166666667], [2278.0, 334.9761904761905], [2262.0, 57.37821297429625], [2310.0, 112.68123076923075], [2326.0, 167.65777262180973], [2342.0, 115.99070385126163], [2358.0, 408.7094837935175], [2374.0, 158.31360946745542], [2422.0, 778.8285714285714], [2406.0, 151.80285929270153], [2390.0, 109.9929203539823], [2438.0, 199.07270233196147], [2454.0, 57.43487109905014], [2470.0, 444.55384615384634], [2486.0, 84.52941176470587], [2502.0, 498.66183136899383], [2550.0, 40.82038834951455], [2534.0, 896.5810055865926], [2518.0, 66.77253218884127], [2566.0, 126.85148514851484], [2582.0, 90.38034865293187], [2598.0, 97.93501048218027], [2614.0, 458.6701461377853], [2630.0, 195.28494041170106], [2678.0, 663.7058823529411], [2662.0, 174.83395107487019], [2646.0, 74.56737588652487], [2694.0, 80.41692789968657], [2710.0, 55.33251533742332], [2726.0, 308.65042979942643], [2742.0, 48.35259259259254], [2758.0, 302.1442307692305], [2806.0, 143.30408472012147], [2790.0, 57.61675579322633], [2774.0, 191.23477297895926], [2822.0, 539.6964285714286], [2838.0, 414.80295566502446], [2854.0, 41.29328621908126], [2870.0, 87.58763693270744], [2886.0, 59.59523809523816], [2934.0, 44.46983311938386], [2918.0, 119.18640955004588], [2902.0, 63.809314586994724], [2950.0, 136.12877583465828], [2966.0, 44.94320137693633], [2982.0, 152.06971153846163], [2998.0, 117.86060606060605], [3014.0, 1057.7419962335211], [3062.0, 87.30095541401273], [3046.0, 108.88656716417927], [3030.0, 160.76569343065714], [3078.0, 605.0083892617447], [3094.0, 86.96568627450978], [3110.0, 35.07182940516273], [3126.0, 199.18590998043035], [3142.0, 247.18443804034595], [3158.0, 41.37083333333332], [3174.0, 199.65459249676582], [3190.0, 80.19623655913969], [3206.0, 64.64148816234507], [3222.0, 309.6732984293199], [3238.0, 65.89204545454547], [3254.0, 163.6490299823634], [3270.0, 45.836734693877546], [3286.0, 228.98273155415998], [3302.0, 148.73951434878563], [3318.0, 76.6923076923077], [3334.0, 78.11748633879778], [3350.0, 53.19793814432991], [3366.0, 45.1431431431432], [3382.0, 125.53975903614453], [3398.0, 738.6882352941178], [3414.0, 163.7729468599033], [3430.0, 123.3679476696647], [3446.0, 210.64197530864197], [3462.0, 937.609375], [3478.0, 59.991886409736324], [3494.0, 362.2986054142741], [3510.0, 247.574269005848], [3526.0, 232.3378746594003], [3542.0, 214.62500000000003], [3558.0, 41.476344086021506], [3574.0, 547.5572232645403], [3590.0, 46.71165644171783], [3606.0, 88.7494226327944], [3622.0, 217.87193973634695], [3638.0, 65.6848341232229], [3654.0, 251.74874371859323], [3670.0, 597.648729446936], [3686.0, 175.83048327137524], [3702.0, 171.14363512593593], [3718.0, 595.1680000000002], [3734.0, 48.22519083969465], [3750.0, 147.43879262157643], [3766.0, 273.85837971552235], [3782.0, 88.28021978021982], [3798.0, 226.81869688385282], [3814.0, 119.80555555555553], [3830.0, 75.3344370860926], [3846.0, 68.22487223168655], [3862.0, 1185.2696177062373], [3878.0, 68.20415879017017], [3894.0, 89.15280135823434], [3910.0, 545.6666666666667], [3926.0, 115.53363228699563], [3942.0, 279.36928104575173], [3958.0, 36.202170963365006], [3974.0, 164.73935483870972], [3990.0, 67.31506849315059], [4006.0, 37.58818770226547], [4022.0, 60.67391304347822], [4038.0, 79.99477611940307], [4054.0, 37.46114649681529], [4070.0, 282.44332855093273], [4086.0, 37.6291970802919], [4108.0, 819.2279411764703], [4140.0, 57.423129251700615], [4172.0, 83.96681614349767], [4204.0, 368.08999999999975], [4236.0, 78.45757071547409], [4268.0, 42.893662728249225], [4300.0, 39.266891891891824], [4332.0, 842.9310793237963], [4364.0, 1036.6721470019336], [4396.0, 45.43517329910137], [4428.0, 45.07889344262291], [4460.0, 86.5283213182286], [4492.0, 142.97821100917437], [4524.0, 637.7782258064517], [4556.0, 562.8473282442751], [4588.0, 37.35102040816325], [4620.0, 93.66427840327532], [4652.0, 51.99121522694002], [4684.0, 251.22929936305715], [4716.0, 37.13432835820892], [4748.0, 1014.3920398009959], [4780.0, 386.103678929766], [4812.0, 109.25333333333333], [4844.0, 353.7332144979202], [4876.0, 145.63401720714765], [4908.0, 146.1261751608117], [4940.0, 495.2929171668667], [4972.0, 802.4398734177212], [4109.0, 73.53846153846156], [4141.0, 72.5005793742758], [4173.0, 105.98151260504214], [4205.0, 205.58098591549305], [4237.0, 41.55680399500626], [4269.0, 300.49142367066906], [4301.0, 138.2117013086988], [4333.0, 164.99461206896552], [4365.0, 518.655172413793], [4397.0, 2023.7707786526703], [4429.0, 244.81109185441937], [4461.0, 1266.2236363636393], [4493.0, 369.8983572895271], [4525.0, 103.78473366282279], [4557.0, 79.55179417738665], [4589.0, 70.64599686028251], [4621.0, 1465.7963855421665], [4653.0, 71.66883116883115], [4685.0, 83.33553421368543], [4717.0, 203.10344827586206], [4749.0, 105.56624319419247], [4781.0, 104.99801061007965], [4813.0, 114.95400238948622], [4845.0, 50.3051020408163], [4877.0, 75.10810810810808], [4909.0, 240.89499192245552], [4941.0, 175.22415370539812], [4973.0, 236.31764705882358], [2055.0, 208.18059558117187], [2071.0, 82.60383141762463], [2087.0, 245.1169811320755], [2103.0, 52.34419817470661], [2119.0, 457.88578680203034], [2167.0, 282.90463215258853], [2151.0, 425.56857142857154], [2135.0, 56.95605700712584], [2183.0, 50.41181818181814], [2199.0, 524.356923076923], [2215.0, 112.72774869109944], [2231.0, 191.083423618635], [2247.0, 132.923317683881], [2295.0, 68.23794466403157], [2279.0, 156.1573875802999], [2263.0, 208.82569496619053], [2311.0, 78.86710963455143], [2327.0, 381.05548216644627], [2343.0, 223.734693877551], [2359.0, 324.21311475409834], [2375.0, 52.262357414448644], [2423.0, 165.57169344870198], [2407.0, 70.22477064220183], [2391.0, 452.673652694611], [2439.0, 101.67142857142856], [2455.0, 237.84441805225654], [2471.0, 84.10521327014206], [2487.0, 54.58064516129033], [2503.0, 183.60443037974682], [2551.0, 394.76857749469315], [2535.0, 100.20650953984286], [2519.0, 51.07876230661046], [2567.0, 48.511557788944735], [2583.0, 46.265734265734295], [2599.0, 156.14546599496268], [2615.0, 77.81995661605204], [2631.0, 71.20402298850567], [2679.0, 100.0675920337961], [2663.0, 108.48571428571432], [2647.0, 86.43049327354257], [2695.0, 57.56689342403625], [2711.0, 250.1698880976605], [2727.0, 97.16596931659691], [2743.0, 69.57142857142856], [2759.0, 98.35602836879433], [2807.0, 47.24679029957208], [2791.0, 121.86785260482867], [2775.0, 76.68568994889276], [2823.0, 88.6580086580087], [2839.0, 60.82030679327973], [2855.0, 173.2820512820513], [2871.0, 49.890697674418654], [2887.0, 354.448275862069], [2935.0, 619.0544444444445], [2919.0, 34.322932917316685], [2903.0, 45.5913370998117], [2951.0, 43.65767441860466], [2967.0, 74.4625748502994], [2983.0, 39.2973180076628], [2999.0, 72.65691294806152], [3015.0, 55.7448840381993], [3063.0, 51.80477673935626], [3047.0, 40.09605488850776], [3031.0, 86.97306397306406], [3079.0, 76.4784240150094], [3095.0, 37.0600961538462], [3111.0, 295.8836329233676], [3127.0, 86.06114649681527], [3143.0, 86.41687657430727], [3159.0, 681.2692307692308], [3175.0, 94.46405228758165], [3191.0, 47.244747899159606], [3207.0, 50.695974576271205], [3223.0, 28.928462709284616], [3239.0, 472.84707446808505], [3255.0, 277.1692789968651], [3271.0, 284.5954500494559], [3287.0, 65.0041753653444], [3303.0, 405.35290519877657], [3319.0, 49.097816593886435], [3335.0, 53.33091202582727], [3351.0, 666.4455017301037], [3367.0, 86.19138755980863], [3383.0, 57.84982935153578], [3399.0, 133.70318840579733], [3415.0, 124.5675306957709], [3431.0, 67.8402234636872], [3447.0, 83.28521332554071], [3463.0, 163.33009708737825], [3479.0, 245.08382642998026], [3495.0, 82.78571428571438], [3511.0, 57.014888337469], [3527.0, 72.22315789473691], [3543.0, 209.38426229508167], [3559.0, 725.6376237623762], [3575.0, 253.53012048192787], [3591.0, 318.7246804326448], [3607.0, 88.75736961451247], [3623.0, 78.30414012738856], [3639.0, 244.43343653250807], [3655.0, 83.15014164305948], [3671.0, 74.55985598559847], [3687.0, 92.77753303964758], [3703.0, 45.911935110081124], [3719.0, 157.63577331759134], [3735.0, 219.19757085020208], [3751.0, 309.6271929824561], [3767.0, 425.68831168831167], [3783.0, 45.52054794520542], [3799.0, 75.15887850467288], [3815.0, 25.96937882764652], [3831.0, 151.0332261521972], [3847.0, 43.51919191919195], [3863.0, 79.66327272727288], [3879.0, 45.439724454649806], [3895.0, 32.87917329093798], [3911.0, 134.9069901790869], [3927.0, 95.12142857142857], [3943.0, 189.35205364626964], [3959.0, 166.14002828854325], [3975.0, 70.87836734693859], [3991.0, 205.0266990291261], [4007.0, 779.1646706586823], [4023.0, 110.34915254237292], [4039.0, 58.94742990654207], [4055.0, 395.0171073094867], [4071.0, 60.1134916039375], [4087.0, 238.58687943262396], [4110.0, 177.53505007153063], [4142.0, 106.40595903165733], [4174.0, 44.471387002909786], [4206.0, 56.36143039591309], [4238.0, 394.5120939875607], [4270.0, 73.5100864553314], [4302.0, 65.38266666666678], [4334.0, 71.05940594059402], [4366.0, 139.7910879629629], [4398.0, 83.30314960629929], [4430.0, 64.50114766641168], [4462.0, 50.010028653295095], [4494.0, 59.68836291913208], [4526.0, 197.82370592648155], [4558.0, 51.49532710280373], [4590.0, 57.864864864864806], [4622.0, 53.69139784946247], [4654.0, 472.4896551724138], [4686.0, 233.99797707349956], [4718.0, 289.5238791423004], [4750.0, 43.98423645320204], [4782.0, 192.54271356783923], [4814.0, 5061.71937639198], [4846.0, 4176.467153284671], [4878.0, 241.9573078854847], [4910.0, 42.38488783943327], [4942.0, 46.413986013986026], [4974.0, 56.72116788321161], [4111.0, 109.49131832797424], [4143.0, 188.73369565217388], [4175.0, 197.6899338721526], [4207.0, 71.63001745200691], [4239.0, 155.46428571428575], [4271.0, 47.792665726375205], [4303.0, 37.40418679549109], [4335.0, 42.3528413910093], [4367.0, 1363.4185022026438], [4399.0, 56.31884057971016], [4431.0, 77.2228826151559], [4463.0, 177.23667820069204], [4495.0, 67.05123966942142], [4527.0, 97.53741496598646], [4559.0, 720.4863945578236], [4591.0, 47.78124999999996], [4623.0, 140.0932741116753], [4655.0, 282.80195381882777], [4687.0, 70.17312348668283], [4719.0, 486.57017543859695], [4751.0, 335.07188612099657], [4783.0, 83.37903225806458], [4815.0, 163.10546874999997], [4847.0, 119.78798185941038], [4879.0, 825.0833333333333], [4911.0, 562.2483221476512], [4943.0, 379.04628949301997], [4975.0, 182.99035812672173], [257.0, 25.764944275582593], [259.0, 15.212290502793305], [261.0, 58.43420015760441], [263.0, 330.2154255319149], [271.0, 48.80547112462003], [269.0, 73.93858751279427], [265.0, 14.503577817531314], [267.0, 30.49598930481281], [273.0, 94.87482219061167], [275.0, 162.23660130718957], [277.0, 18.953846153846143], [279.0, 188.63766632548618], [287.0, 128.4508196721312], [285.0, 14.207331042382593], [281.0, 107.92886456908346], [283.0, 250.28571428571428], [289.0, 103.99392097264439], [291.0, 15.308209959623143], [293.0, 394.85333333333335], [295.0, 14.138559708295354], [303.0, 760.875], [301.0, 172.60137931034484], [297.0, 107.9179004037685], [299.0, 254.04246284501062], [305.0, 18.855319148936168], [307.0, 111.8108843537415], [309.0, 88.18050541516246], [311.0, 136.66996047430828], [319.0, 19.24733475479742], [317.0, 168.01232032854207], [313.0, 114.92662116040957], [315.0, 17.093268450932698], [321.0, 72.51134020618551], [323.0, 138.61961206896552], [325.0, 34.74921956295524], [327.0, 26.00787401574804], [335.0, 177.71774891774902], [333.0, 16.991745283018894], [329.0, 177.45351043643262], [331.0, 66.28612716763011], [337.0, 198.88638799571277], [339.0, 141.42931483087597], [341.0, 27.53799392097264], [343.0, 17.54058876003564], [351.0, 250.63456464379948], [349.0, 34.09914204003815], [345.0, 64.2466960352423], [347.0, 20.48024316109421], [353.0, 61.117960426179614], [355.0, 19.061403508771928], [357.0, 257.5108108108108], [359.0, 27.58798283261803], [367.0, 76.9450317124736], [365.0, 169.99472295514516], [361.0, 60.98624904507256], [363.0, 279.1192842942346], [369.0, 4045.1190476190477], [371.0, 19.597639484978533], [373.0, 1.4583333333333335], [375.0, 255.57991513437057], [383.0, 488.52542372881356], [381.0, 177.7380281690141], [377.0, 102.20526893523603], [379.0, 144.12106299212599], [385.0, 105.6777358490566], [387.0, 37.84677419354831], [389.0, 146.6695938529089], [391.0, 53.31401475237094], [399.0, 122.28095238095239], [397.0, 169.4987012987013], [393.0, 168.55], [395.0, 31.206948640483365], [401.0, 31.22897196261681], [403.0, 67.96000000000001], [405.0, 50.139269406392685], [407.0, 117.14087759815241], [415.0, 66.91494252873565], [413.0, 76.85103926097003], [409.0, 58.7803121248499], [411.0, 109.14455445544554], [417.0, 46.55970149253735], [419.0, 77.62613981762914], [421.0, 480.36842105263156], [423.0, 34.27391304347834], [431.0, 116.58974358974356], [429.0, 145.82769230769236], [425.0, 136.4054982817869], [427.0, 33.40364583333331], [433.0, 48.55629770992371], [435.0, 29.29187396351576], [437.0, 37.439531859557874], [439.0, 418.13457556935833], [447.0, 156.62837837837836], [445.0, 36.001307189542466], [441.0, 119.1430517711172], [443.0, 153.49999999999997], [449.0, 24.315261044176705], [451.0, 69.85053037608488], [453.0, 182.3425414364641], [455.0, 25.35780765253361], [463.0, 90.36921529175046], [461.0, 80.96812749003979], [457.0, 19.38775510204084], [459.0, 52.726732673267335], [465.0, 44.909315746084104], [467.0, 65.70089285714288], [469.0, 27.085263157894744], [471.0, 118.38323353293411], [479.0, 78.94954128440372], [477.0, 228.72494669509595], [473.0, 55.67849462365594], [475.0, 45.141802067946834], [481.0, 61.498018494055486], [483.0, 22.749586776859495], [485.0, 49.67152466367717], [487.0, 28.78213166144202], [495.0, 65.92318634423908], [493.0, 25.04154302670623], [489.0, 123.519042437432], [491.0, 174.91794871794872], [497.0, 142.48418972332016], [499.0, 45.17761989342801], [501.0, 141.96410256410257], [503.0, 104.2144144144144], [511.0, 42.27826941986236], [509.0, 31.385563380281717], [505.0, 69.22222222222221], [507.0, 103.24844720496895], [518.0, 259.7554112554112], [514.0, 40.72200392927304], [526.0, 89.45841995841997], [522.0, 138.72878667724027], [542.0, 27.32756964457251], [538.0, 39.55111111111114], [530.0, 117.34922680412376], [534.0, 225.5964083175803], [550.0, 52.551020408163225], [546.0, 59.45204262877445], [558.0, 26.167709637046293], [554.0, 98.04092071611257], [574.0, 54.28846153846155], [570.0, 56.10757946210265], [562.0, 31.033333333333342], [566.0, 43.04593175853023], [582.0, 166.64361702127664], [578.0, 128.91420664206643], [590.0, 99.26235294117645], [586.0, 90.76250933532486], [606.0, 176.81950384944398], [602.0, 99.73486682808718], [594.0, 148.06126126126125], [598.0, 202.6495726495727], [614.0, 37.66004962779156], [610.0, 350.05691056910575], [622.0, 96.15515840779855], [618.0, 128.7362962962963], [638.0, 54.03131828113618], [634.0, 413.95857988165676], [626.0, 31.41763341067283], [630.0, 165.070297029703], [646.0, 45.16086671043992], [642.0, 118.54350927246787], [654.0, 53.00284697508903], [650.0, 326.59597523219804], [670.0, 88.20209723546233], [666.0, 115.30426540284358], [658.0, 33.04529914529917], [662.0, 97.14981949458482], [678.0, 319.3661417322835], [674.0, 180.3381389252949], [686.0, 144.4511352418559], [682.0, 132.19854014598545], [702.0, 38.26368159203976], [698.0, 136.9920948616601], [690.0, 141.0242070116861], [694.0, 231.69021739130437], [710.0, 279.96915422885576], [706.0, 157.85397412199626], [718.0, 102.16651904340128], [714.0, 33.9138461538462], [734.0, 34.02756244616709], [730.0, 120.90042674253206], [722.0, 48.43956043956044], [726.0, 114.15487094088272], [742.0, 55.13859416445626], [738.0, 109.93310265282582], [750.0, 380.6390532544379], [746.0, 41.6953441295547], [766.0, 56.50068870523414], [762.0, 187.46058091286307], [754.0, 59.992706053975084], [758.0, 75.73677419354836], [774.0, 57.44749999999999], [770.0, 49.676470588235276], [782.0, 52.118793211816524], [778.0, 56.162341982701356], [798.0, 135.11585365853662], [794.0, 73.28073572120036], [786.0, 146.73195876288656], [790.0, 67.27970749542962], [806.0, 47.426086956521736], [802.0, 115.53625837903724], [814.0, 100.27688172043007], [810.0, 128.36342857142847], [830.0, 51.18638466622607], [826.0, 36.41866028708133], [818.0, 69.1622176591377], [822.0, 83.29349269588309], [838.0, 41.39151712887438], [834.0, 136.40588760035678], [846.0, 90.61199095022633], [842.0, 216.58426966292137], [862.0, 154.3973094170404], [858.0, 144.9762589928057], [850.0, 222.3930131004367], [854.0, 139.86915887850466], [870.0, 49.956097560975635], [866.0, 330.5626373626373], [878.0, 62.87145557655954], [874.0, 68.11964107676958], [894.0, 38.94391534391533], [890.0, 146.33733333333333], [882.0, 232.10503597122297], [886.0, 142.54471544715454], [902.0, 90.13975155279498], [898.0, 80.56191744340889], [910.0, 63.20548780487812], [906.0, 99.22566909975677], [926.0, 82.49549549549549], [922.0, 158.4983108108108], [914.0, 566.7666666666667], [918.0, 47.069060773480714], [934.0, 74.58053097345135], [930.0, 214.13207547169802], [942.0, 64.78627671541047], [938.0, 465.8402777777778], [958.0, 48.72185430463578], [954.0, 67.66666666666649], [946.0, 184.4958677685951], [950.0, 71.14073339940539], [966.0, 114.71134020618553], [962.0, 325.80076628352487], [974.0, 91.05537459283389], [970.0, 86.3296442687747], [990.0, 147.0538922155688], [986.0, 161.9556786703601], [978.0, 158.51794871794857], [982.0, 86.14610221992767], [998.0, 118.00201207243468], [994.0, 105.66454965357973], [1006.0, 61.56957928802597], [1002.0, 146.18425460636516], [1022.0, 113.24091671324747], [1018.0, 179.74907749077488], [1010.0, 233.09404388714734], [1014.0, 124.3775198533903], [1036.0, 217.80188679245276], [1028.0, 35.42517006802717], [1052.0, 45.04000000000003], [1044.0, 65.01647286821708], [1084.0, 100.92937219730939], [1076.0, 92.56118421052628], [1060.0, 120.57947434292873], [1068.0, 45.40399999999994], [1100.0, 384.21764705882356], [1092.0, 173.9018404907975], [1116.0, 107.6723549488054], [1108.0, 72.9438596491228], [1148.0, 148.6034236804565], [1140.0, 55.8], [1124.0, 111.37965760322255], [1132.0, 216.14452332657186], [1164.0, 95.13588850174224], [1156.0, 121.06279863481232], [1180.0, 77.50696202531657], [1172.0, 108.84726688102894], [1212.0, 131.12109672505716], [1204.0, 126.69688385269106], [1188.0, 224.08672376873682], [1196.0, 77.07302075326679], [1228.0, 270.4920127795528], [1220.0, 1302.8478260869567], [1244.0, 92.28486646884275], [1236.0, 40.75718257645969], [1276.0, 927.6476683937824], [1268.0, 100.51662049861507], [1252.0, 135.22310126582275], [1260.0, 261.206002728513], [1292.0, 172.3268698060942], [1284.0, 80.61732283464563], [1308.0, 96.95631067961158], [1300.0, 627.9544235924933], [1340.0, 149.96907216494844], [1332.0, 87.61175496688759], [1316.0, 260.8722382324687], [1324.0, 198.31331592689304], [1356.0, 150.05414847161575], [1348.0, 147.35990139687755], [1372.0, 105.92272126816377], [1364.0, 121.8775743707094], [1404.0, 103.77363896848159], [1396.0, 91.13545568039952], [1380.0, 55.66286644951153], [1388.0, 54.0543364681296], [1420.0, 74.69721656483361], [1412.0, 120.41634738186464], [1436.0, 125.68724279835382], [1428.0, 40.362130177514864], [1468.0, 83.15957446808511], [1460.0, 151.5553470919324], [1444.0, 49.63794871794873], [1452.0, 81.0], [1484.0, 275.4864864864865], [1476.0, 59.372141372141336], [1500.0, 58.4382911392405], [1492.0, 77.44194756554302], [1532.0, 394.8429487179487], [1524.0, 575.2164179104481], [1508.0, 96.09289617486338], [1516.0, 172.50204081632643], [1540.0, 84.65784832451493], [1548.0, 110.94425087108016], [1556.0, 73.04770992366399], [1564.0, 87.37891268533771], [1596.0, 210.79393939393944], [1588.0, 156.3179587831208], [1572.0, 150.51635351426586], [1580.0, 1530.2027027027036], [1604.0, 104.52129471890977], [1612.0, 174.68795741849655], [1620.0, 113.30092264017019], [1628.0, 67.02238805970147], [1660.0, 561.9125], [1652.0, 68.46666666666664], [1636.0, 180.15537848605572], [1644.0, 163.96170678336972], [1668.0, 186.79475100942125], [1676.0, 85.51977793199148], [1684.0, 259.4510250569478], [1692.0, 315.28411633109624], [1724.0, 39.05829596412561], [1716.0, 301.2881355932199], [1700.0, 105.04162219850592], [1708.0, 240.43992055610718], [1732.0, 192.51020408163268], [1740.0, 179.96134208606864], [1748.0, 75.3878048780488], [1756.0, 69.70744010088272], [1788.0, 78.19218750000002], [1780.0, 90.63036649214662], [1764.0, 47.9675324675324], [1772.0, 282.5330926594464], [1796.0, 66.59652777777788], [1804.0, 57.29614325068867], [1812.0, 163.30735930735938], [1820.0, 136.695917123705], [1852.0, 519.5714285714286], [1844.0, 139.96937499999976], [1828.0, 60.42573471008732], [1836.0, 107.52561247216038], [1860.0, 462.04433497536917], [1868.0, 200.85928489042692], [1876.0, 52.98529411764701], [1884.0, 87.05350553505542], [1916.0, 87.70069930069933], [1908.0, 119.20854700854701], [1892.0, 120.47237076648851], [1900.0, 264.6221864951767], [1924.0, 106.3129539951572], [1932.0, 129.92112299465242], [1940.0, 541.6047904191615], [1948.0, 151.28719723183397], [1980.0, 237.38500000000016], [1972.0, 113.82198952879574], [1956.0, 56.54577464788736], [1964.0, 138.65890308039087], [1988.0, 148.83751253761278], [1996.0, 48.93421052631587], [2004.0, 280.22222222222223], [2012.0, 159.60199004975118], [2044.0, 356.60118343195285], [2036.0, 81.49679193400551], [2020.0, 148.4055555555555], [2028.0, 171.7204433497535], [2056.0, 71.07515923566883], [2072.0, 60.761209593326406], [2088.0, 88.77175843694505], [2104.0, 379.215909090909], [2168.0, 289.74941995359586], [2152.0, 298.3299663299661], [2120.0, 81.78452066842564], [2136.0, 156.05733082706763], [2184.0, 38.014492753623195], [2200.0, 215.85833968012145], [2216.0, 48.35139092240119], [2232.0, 87.43615494978475], [2296.0, 73.46596858638745], [2280.0, 176.22580645161287], [2248.0, 93.24544480171487], [2264.0, 122.16642958748218], [2312.0, 385.5620437956204], [2328.0, 65.14820359281445], [2344.0, 79.79255918827522], [2360.0, 46.81588447653428], [2424.0, 64.53907815631271], [2408.0, 317.32774193548374], [2376.0, 64.35355648535563], [2392.0, 73.60084328882651], [2440.0, 48.94456521739131], [2456.0, 296.3636363636363], [2472.0, 42.6454456415279], [2488.0, 62.32891832229588], [2552.0, 109.98717948717947], [2536.0, 37.99886621315188], [2504.0, 43.11394712853244], [2520.0, 539.5795454545456], [2568.0, 233.1091405184176], [2584.0, 462.3616692426576], [2600.0, 49.58583106267029], [2616.0, 179.2336683417083], [2680.0, 234.3312799452433], [2664.0, 48.92948717948711], [2632.0, 183.1262569832403], [2648.0, 126.77426636568852], [2696.0, 180.14422419685587], [2712.0, 76.37513873473924], [2728.0, 41.02594339622636], [2744.0, 107.53758088601292], [2808.0, 134.79343220338993], [2792.0, 72.82975206611569], [2760.0, 49.12938816449352], [2776.0, 48.68287037037041], [2824.0, 110.60301507537677], [2840.0, 48.968166849615756], [2856.0, 155.141361256544], [2872.0, 1634.4857685009488], [2936.0, 115.51085832471556], [2920.0, 244.34231536926137], [2888.0, 1770.0387135199508], [2904.0, 2201.196721311475], [2952.0, 405.96111111111094], [2968.0, 362.15437158469985], [2984.0, 330.6198830409358], [3000.0, 165.66793602437158], [3064.0, 419.53775443204216], [3048.0, 465.0405228758163], [3016.0, 48.13029661016951], [3032.0, 38.17957746478877], [3080.0, 50.66945606694565], [3096.0, 300.67542857142865], [3112.0, 96.31622746185862], [3128.0, 45.10981308411213], [3144.0, 68.81640625000001], [3160.0, 126.29273084479361], [3176.0, 42.5200421940929], [3192.0, 742.8835978835978], [3208.0, 259.77960865087533], [3224.0, 269.81402214022114], [3240.0, 142.58662613981764], [3256.0, 674.9659999999999], [3272.0, 85.66503067484665], [3288.0, 207.04507042253516], [3304.0, 90.70866141732284], [3320.0, 553.4420168067226], [3336.0, 419.5028571428572], [3352.0, 89.64421416234875], [3368.0, 81.74957118353345], [3384.0, 99.17543859649122], [3400.0, 132.47787610619474], [3416.0, 43.296500920810345], [3432.0, 49.13804437140512], [3448.0, 73.458942632171], [3464.0, 340.9918283963226], [3480.0, 82.89285714285715], [3496.0, 54.2624053826746], [3512.0, 39.37288135593221], [3528.0, 243.70480404551222], [3544.0, 115.5776930409915], [3560.0, 72.56929460580908], [3576.0, 39.14750290360047], [3592.0, 73.64985163204746], [3608.0, 67.49371859296477], [3624.0, 214.0944963655244], [3640.0, 79.37060702875404], [3656.0, 44.69711538461543], [3672.0, 45.0382513661202], [3688.0, 42.547268907563016], [3704.0, 1305.0909090909092], [3720.0, 223.1882716049383], [3736.0, 38.82082866741321], [3752.0, 171.2968881412951], [3768.0, 291.10362429811124], [3784.0, 689.751351351351], [3800.0, 53.96751900483763], [3816.0, 332.3480519480521], [3832.0, 784.6012488849246], [3848.0, 1665.1014799154327], [3864.0, 172.80720606826793], [3880.0, 919.0026863666889], [3896.0, 176.43402328589912], [3912.0, 68.65756302521014], [3928.0, 55.48377581120947], [3944.0, 70.55759599332224], [3960.0, 81.82344827586203], [3976.0, 86.84639498432601], [3992.0, 80.89517819706501], [4008.0, 76.47887323943655], [4024.0, 166.96853932584284], [4040.0, 379.53153153153147], [4056.0, 77.76937618147444], [4072.0, 174.82965517241374], [4088.0, 64.63810151615023], [4112.0, 48.94109396914444], [4144.0, 59.115690527838], [4176.0, 76.69925611052078], [4208.0, 105.64248704663208], [4240.0, 49.32932692307692], [4272.0, 336.6541244573082], [4304.0, 85.51643192488268], [4336.0, 257.1559405940594], [4368.0, 101.19785189372512], [4400.0, 392.25135623869846], [4432.0, 468.3544733861842], [4464.0, 734.8205128205132], [4496.0, 1170.7139534883727], [4528.0, 56.93406593406591], [4560.0, 67.15388768898488], [4592.0, 268.9868247694333], [4624.0, 100.48837209302324], [4656.0, 163.56711409395967], [4688.0, 138.48503611971105], [4720.0, 93.06701940035272], [4752.0, 140.06382978723403], [4784.0, 56.32564102564109], [4816.0, 445.3306613226455], [4848.0, 343.73981415296635], [4880.0, 429.6089743589746], [4912.0, 225.0675287356318], [4944.0, 81.11583011583005], [4976.0, 79.17795918367361], [4113.0, 147.63773584905658], [4177.0, 44.60292850990522], [4209.0, 53.174584323040385], [4241.0, 72.64971751412433], [4273.0, 81.90703679793417], [4305.0, 213.4865702479335], [4337.0, 195.26097178683372], [4369.0, 1432.3695652173908], [4401.0, 67.90068965517236], [4433.0, 42.52701505757302], [4465.0, 40.96059782608695], [4497.0, 112.27314814814817], [4529.0, 76.86177105831534], [4561.0, 200.4323386537127], [4593.0, 67.41478260869562], [4625.0, 46.005870841487315], [4657.0, 98.24655819774712], [4689.0, 183.9411309062736], [4721.0, 40.283928571428625], [4753.0, 55.76369582992638], [4785.0, 405.6292559899116], [4817.0, 162.54952076677299], [4849.0, 91.81012658227847], [4881.0, 93.53455571227099], [4913.0, 530.3803680981596], [4945.0, 51.47054545454548], [4977.0, 52.614065180102905], [2057.0, 64.51221498371333], [2073.0, 247.45624999999995], [2089.0, 40.875144508670495], [2105.0, 115.7931292008962], [2169.0, 511.66888888888894], [2153.0, 327.5125348189415], [2121.0, 52.10172413793106], [2137.0, 114.8698224852071], [2185.0, 442.6720647773282], [2201.0, 47.04145077720205], [2217.0, 306.7722419928826], [2233.0, 51.63886572143453], [2297.0, 338.2609819121447], [2281.0, 91.42701525054459], [2249.0, 43.025200458190156], [2265.0, 165.33931947069945], [2313.0, 182.1632363378282], [2329.0, 48.963203463203506], [2345.0, 113.87463976945244], [2361.0, 317.36792452830207], [2425.0, 603.4615384615386], [2409.0, 111.49418084153982], [2377.0, 227.42538354253824], [2393.0, 173.4893238434163], [2441.0, 152.0443349753695], [2457.0, 55.59519038076153], [2473.0, 252.4359387590653], [2489.0, 40.07500000000001], [2553.0, 77.568981921979], [2537.0, 514.2820512820513], [2505.0, 1142.6902313624685], [2521.0, 60.070765661252864], [2569.0, 94.76205787781348], [2585.0, 77.83211678832126], [2601.0, 2739.356209150325], [2617.0, 41.59040590405904], [2681.0, 135.92105263157896], [2665.0, 385.28249566724435], [2633.0, 103.76218787158132], [2649.0, 90.14541387024613], [2697.0, 133.5978260869565], [2713.0, 55.046511627907], [2729.0, 810.6440677966101], [2745.0, 145.7724741447893], [2809.0, 90.8062015503877], [2793.0, 42.65684410646391], [2761.0, 232.14525810324125], [2777.0, 228.45547945205465], [2825.0, 104.71684587813631], [2841.0, 216.08333333333331], [2857.0, 51.029743589743596], [2873.0, 106.33221476510076], [2937.0, 40.35039370078736], [2921.0, 74.36942675159239], [2889.0, 176.829757785467], [2905.0, 162.8867595818812], [2953.0, 69.02142443543744], [2969.0, 76.95664335664333], [2985.0, 250.98457979953662], [3001.0, 82.80000000000001], [3065.0, 97.9042553191489], [3049.0, 84.54867256637161], [3017.0, 165.28089887640454], [3033.0, 304.9363395225467], [3081.0, 391.5414746543777], [3097.0, 181.9319213313164], [3113.0, 44.301832208293206], [3129.0, 225.72493100275963], [3145.0, 112.38139534883717], [3161.0, 290.9236826165966], [3177.0, 471.0564971751412], [3193.0, 100.65648414985596], [3209.0, 39.545714285714276], [3225.0, 76.41821247892076], [3241.0, 40.82528533801578], [3257.0, 99.05164737310776], [3273.0, 44.927364864864856], [3289.0, 116.56746532156369], [3305.0, 37.31590656284762], [3321.0, 72.53631840796018], [3337.0, 136.81323185011703], [3353.0, 56.70783132530111], [3369.0, 43.58600917431189], [3385.0, 166.41633199464542], [3401.0, 84.80694980694975], [3417.0, 382.5285714285714], [3433.0, 250.6484962406011], [3449.0, 175.64607843137276], [3465.0, 88.9910011248594], [3481.0, 46.33971291866033], [3497.0, 421.48172043010794], [3513.0, 474.68831168831167], [3529.0, 76.71216617210689], [3545.0, 466.85600794438864], [3561.0, 54.35144927536237], [3577.0, 5822.695652173913], [3593.0, 57.35269709543572], [3609.0, 50.08436724565752], [3625.0, 70.70378619153672], [3641.0, 48.65811088295688], [3657.0, 281.4553119730185], [3673.0, 588.2065217391306], [3689.0, 224.7144046627811], [3705.0, 170.24514200298938], [3721.0, 75.01069518716577], [3737.0, 235.62818955042533], [3753.0, 41.11111111111113], [3769.0, 93.62689585439861], [3785.0, 86.09781890284202], [3801.0, 505.7177177177171], [3817.0, 71.36652835408024], [3833.0, 49.636160714285744], [3849.0, 87.3552123552125], [3865.0, 66.92024539877303], [3881.0, 66.51912568306012], [3897.0, 90.36338028169014], [3913.0, 334.44464944649457], [3929.0, 397.46251768033915], [3945.0, 137.39569049951027], [3961.0, 46.869660460021855], [3977.0, 115.81651376146787], [3993.0, 43.896475770925036], [4009.0, 772.8895348837207], [4025.0, 86.09182389937108], [4041.0, 65.04263565891482], [4057.0, 46.1967213114755], [4073.0, 70.75885328836425], [4089.0, 253.09803921568624], [4114.0, 155.5370575221243], [4146.0, 192.6785714285711], [4178.0, 2334.6285714285705], [4210.0, 241.85163204747764], [4242.0, 97.16475972540046], [4274.0, 114.1685236768804], [4306.0, 29.651315789473713], [4338.0, 43.11758241758239], [4370.0, 78.1224643125472], [4402.0, 427.32064777327935], [4434.0, 921.3010752688172], [4466.0, 1794.4173228346458], [4498.0, 511.5200471698127], [4530.0, 230.29126213592232], [4562.0, 74.5323834196891], [4594.0, 57.54636591478696], [4626.0, 573.8251231527096], [4658.0, 267.6177658142672], [4690.0, 60.59388646288208], [4722.0, 401.3374233128835], [4754.0, 265.25179340028706], [4786.0, 153.78639104220494], [4818.0, 71.9928057553956], [4850.0, 331.3023551877785], [4882.0, 260.5043706293706], [4914.0, 294.46327995582584], [4946.0, 768.7711598746068], [4978.0, 109.15217391304346], [4115.0, 894.3190883190866], [4147.0, 60.39044289044289], [4179.0, 107.87887828162272], [4211.0, 95.62031250000005], [4243.0, 39.58008658008659], [4275.0, 81.01926444833623], [4307.0, 1000.8948043617729], [4339.0, 127.79354094578991], [4371.0, 47.495614035087705], [4403.0, 95.16975308641977], [4435.0, 260.0307086614173], [4467.0, 139.95298858294183], [4499.0, 80.503198294243], [4531.0, 119.11816467630432], [4563.0, 49.70772946859903], [4595.0, 246.88374596340174], [4627.0, 62.41813031161486], [4659.0, 41.2998137802607], [4691.0, 475.69512195122087], [4723.0, 70.07521255722703], [4755.0, 69.66603053435114], [4787.0, 1239.846064814815], [4819.0, 177.6147308781869], [4851.0, 86.03829160530199], [4883.0, 85.97297297297305], [4915.0, 845.9225473321852], [4947.0, 83.14285714285717], [4979.0, 164.68361581920908], [1037.0, 182.58373205741646], [1029.0, 185.85169491525428], [1053.0, 84.51529790660227], [1045.0, 265.4569247546347], [1085.0, 190.51694915254234], [1077.0, 212.9922480620155], [1061.0, 83.63552068473606], [1069.0, 93.59538152610442], [1101.0, 75.88083273510411], [1093.0, 65.43903903903897], [1117.0, 134.03619047619057], [1109.0, 137.95568400770713], [1149.0, 276.09854014598534], [1141.0, 63.20350109409188], [1125.0, 127.02320887991928], [1133.0, 165.52081756245275], [1165.0, 75.4805414551607], [1157.0, 50.06087735004477], [1181.0, 189.34523809523807], [1173.0, 158.44635627530369], [1213.0, 166.5310245310245], [1205.0, 97.23083197389887], [1189.0, 105.02465331278896], [1197.0, 76.99187935034807], [1229.0, 89.60875331564979], [1221.0, 123.76268320180384], [1245.0, 95.85856905158059], [1237.0, 202.95254237288134], [1277.0, 130.48436460412498], [1269.0, 73.67296416938117], [1253.0, 87.96582278481006], [1261.0, 106.27362637362637], [1293.0, 77.26759474091251], [1285.0, 339.3443396226415], [1309.0, 143.19204284621264], [1301.0, 95.44461228600211], [1341.0, 142.71108179419517], [1333.0, 250.38156028368778], [1317.0, 176.79598145285937], [1325.0, 170.28542914171655], [1357.0, 63.74954792043398], [1349.0, 171.39100346020763], [1373.0, 101.77834612105718], [1365.0, 69.57221006564555], [1405.0, 70.17835909631384], [1397.0, 89.11240310077517], [1381.0, 416.1785714285714], [1389.0, 116.49746926970379], [1421.0, 148.90318302387257], [1413.0, 49.52802893309214], [1437.0, 171.3980978260869], [1429.0, 154.95294117647072], [1469.0, 113.61072386058981], [1461.0, 112.88025210084038], [1445.0, 72.6919191919192], [1453.0, 91.17739130434784], [1485.0, 118.77532327586215], [1477.0, 91.38435940099838], [1501.0, 319.0514705882353], [1493.0, 176.7142857142857], [1533.0, 69.89655172413812], [1525.0, 807.6688963210698], [1509.0, 33.27345309381236], [1517.0, 88.58909682668833], [1541.0, 108.20713305898487], [1549.0, 104.85823336968363], [1557.0, 156.9344608879493], [1565.0, 172.04669703872437], [1597.0, 70.74270900842536], [1589.0, 108.4757281553398], [1573.0, 170.23356009070295], [1581.0, 144.57477168949748], [1605.0, 92.09960159362558], [1613.0, 205.6728971962617], [1621.0, 75.5219594594595], [1629.0, 114.48445595854922], [1661.0, 138.75218658892118], [1653.0, 70.56997971602429], [1637.0, 61.70315398886838], [1645.0, 218.80269814502523], [1669.0, 929.9097222222223], [1677.0, 176.61293984108963], [1685.0, 102.63103192279146], [1693.0, 77.2915422885572], [1725.0, 75.4733727810651], [1717.0, 69.59111111111112], [1701.0, 30.270212765957442], [1709.0, 63.25835866261398], [1733.0, 180.83533333333344], [1741.0, 107.04477611940298], [1749.0, 69.1056105610561], [1757.0, 353.8979591836735], [1789.0, 172.6760563380284], [1781.0, 271.27251995439036], [1765.0, 83.82474226804128], [1773.0, 48.98924731182796], [1797.0, 194.38770388958582], [1805.0, 181.38832772166091], [1813.0, 88.26578947368431], [1821.0, 88.84842105263152], [1853.0, 145.19911012235804], [1845.0, 49.815950920245385], [1829.0, 267.14184397163103], [1837.0, 217.7299196787149], [1861.0, 68.3838315217391], [1869.0, 90.6223175965665], [1877.0, 253.52923976608204], [1885.0, 54.165198237885456], [1917.0, 171.3798955613577], [1909.0, 132.03419972640225], [1893.0, 131.96358267716536], [1901.0, 99.16068376068377], [1925.0, 123.63647416413379], [1933.0, 48.31334841628963], [1941.0, 74.44981949458474], [1949.0, 83.12896405919659], [1981.0, 85.8759455370651], [1973.0, 73.60669856459337], [1957.0, 266.69168591224025], [1965.0, 49.90233362143477], [1989.0, 213.4004163775159], [1997.0, 55.91903719912478], [2005.0, 49.4175732217573], [2013.0, 62.465153970826655], [2045.0, 87.65168539325853], [2037.0, 44.96898263027292], [2021.0, 55.64754716981137], [2029.0, 61.69545454545458], [2058.0, 202.09551374819097], [2074.0, 128.2819732034103], [2090.0, 159.50184956843384], [2106.0, 87.4266538830297], [2170.0, 793.7685305591673], [2154.0, 216.62366412213737], [2122.0, 213.07640949554863], [2138.0, 322.54180418041767], [2186.0, 94.22680412371132], [2202.0, 209.32516129032277], [2218.0, 451.5805022156573], [2234.0, 183.58506819813354], [2298.0, 98.28228782287813], [2282.0, 82.18856121537085], [2250.0, 238.6998031496064], [2266.0, 157.60888407367278], [2314.0, 87.89971346704868], [2330.0, 1865.685714285714], [2346.0, 306.5476020042954], [2362.0, 84.33197831978315], [2426.0, 147.27917189460462], [2410.0, 58.797938144329926], [2378.0, 54.451983298538536], [2394.0, 125.0308529945553], [2442.0, 99.97316384180803], [2458.0, 99.32896652110617], [2474.0, 63.29148936170212], [2490.0, 165.94741655235524], [2554.0, 667.9076086956521], [2538.0, 74.42256097560983], [2506.0, 72.54892601431985], [2522.0, 145.33510235026554], [2570.0, 49.82768635043557], [2586.0, 260.07734806629844], [2602.0, 135.60440613026816], [2618.0, 220.72410632447284], [2682.0, 57.60062893081761], [2666.0, 71.80564263322876], [2634.0, 72.93362350380856], [2650.0, 182.43426883308723], [2698.0, 47.210597826086925], [2714.0, 295.4727074235808], [2730.0, 89.12177985948456], [2746.0, 133.6836734693877], [2810.0, 51.85648854961832], [2794.0, 1059.1515151515155], [2762.0, 76.5507399577169], [2778.0, 71.40161725067402], [2826.0, 36.88126649076514], [2842.0, 134.47771836007138], [2858.0, 282.93488372093026], [2874.0, 50.65113974231916], [2938.0, 244.2606255012031], [2922.0, 56.056179775280846], [2890.0, 86.89447236180908], [2906.0, 132.2727272727273], [2954.0, 189.98282828282814], [2970.0, 325.54015887025594], [2986.0, 45.949579831932745], [3002.0, 351.2538989394884], [3066.0, 82.94649122807012], [3050.0, 50.29931972789125], [3018.0, 386.3743895822034], [3034.0, 101.48687845303861], [3082.0, 59.91780821917808], [3098.0, 61.69630872483229], [3114.0, 655.4052044609666], [3130.0, 85.34301521438455], [3146.0, 273.4935064935065], [3162.0, 82.85531914893616], [3178.0, 94.9193066347878], [3194.0, 132.519526627219], [3210.0, 210.08424599831497], [3226.0, 41.51094890510942], [3242.0, 3178.5909090909095], [3258.0, 343.5088626292467], [3274.0, 94.9338374291115], [3290.0, 31.715466351829992], [3306.0, 752.6890927624878], [3322.0, 48.49261511728934], [3338.0, 203.57553058676663], [3354.0, 165.68715083798875], [3370.0, 401.46447140381287], [3386.0, 55.350262697022714], [3402.0, 1085.2110418521793], [3418.0, 708.7228370221334], [3434.0, 35.50823271130625], [3450.0, 65.03162486368606], [3466.0, 41.3397435897436], [3482.0, 218.13946587537092], [3498.0, 67.75000000000001], [3514.0, 116.93189964157668], [3530.0, 53.01657000828505], [3546.0, 38.87337278106509], [3562.0, 83.66209677419353], [3578.0, 220.35372144436212], [3594.0, 547.2307692307694], [3610.0, 92.35], [3626.0, 38.7294605809128], [3642.0, 196.42121931908125], [3658.0, 80.16336241078515], [3674.0, 90.22628167354172], [3690.0, 87.08731808731805], [3706.0, 43.312666076173535], [3722.0, 58.92861907938618], [3738.0, 86.33667180277345], [3754.0, 250.4397031539889], [3770.0, 41.957227138643034], [3786.0, 241.04104803493468], [3802.0, 104.1485148514852], [3818.0, 40.23513011152417], [3834.0, 329.1525704809285], [3850.0, 49.401498929336114], [3866.0, 970.1955873583776], [3882.0, 53.57231245166274], [3898.0, 430.9642470205848], [3914.0, 1248.5792410714296], [3930.0, 73.76218001651525], [3946.0, 44.57609805924419], [3962.0, 323.9539877300614], [3978.0, 56.434416365824305], [3994.0, 173.6013245033112], [4010.0, 84.07843137254902], [4026.0, 51.429775280898866], [4042.0, 234.63436790310337], [4058.0, 1635.3684210526317], [4074.0, 139.44902506963803], [4090.0, 104.13829787234042], [4116.0, 87.86880466472303], [4148.0, 681.6710418375727], [4180.0, 1111.1201298701294], [4212.0, 50.11724137931039], [4244.0, 333.18811881188145], [4276.0, 52.38208409506394], [4308.0, 77.28017241379308], [4340.0, 92.88492706645069], [4372.0, 372.4029180695845], [4404.0, 60.861864406779695], [4436.0, 71.90468497576737], [4468.0, 42.338709677419324], [4500.0, 410.10996563573883], [4532.0, 52.57048249763485], [4564.0, 4141.532374100715], [4596.0, 121.84256926952125], [4628.0, 187.96760710553815], [4660.0, 49.65182987141435], [4692.0, 106.54218880534653], [4724.0, 122.9786950732356], [4756.0, 183.38685121107278], [4788.0, 67.28458498023717], [4820.0, 117.41854934601666], [4852.0, 270.30279898218845], [4884.0, 513.9590080971658], [4916.0, 209.82484567901238], [4948.0, 1367.6481481481453], [4980.0, 60.58938547486026], [4117.0, 54.96379044684131], [4149.0, 45.68590831918507], [4181.0, 73.15937940761636], [4213.0, 234.82142857142867], [4245.0, 289.0621669627], [4277.0, 177.200168918919], [4309.0, 31.292857142857148], [4341.0, 51.3731617647059], [4373.0, 71.46073793755916], [4405.0, 234.13367942894234], [4437.0, 87.64376130198912], [4469.0, 407.2790697674419], [4501.0, 118.79409746053531], [4533.0, 343.74892241379354], [4565.0, 58.95961422543693], [4597.0, 1052.529255319149], [4629.0, 77.65411298315169], [4661.0, 210.55057167985936], [4693.0, 277.56451612903226], [4725.0, 277.9616724738676], [4757.0, 81.95051783659396], [4789.0, 114.55261165783504], [4821.0, 42.4124236252546], [4853.0, 90.22545454545453], [4885.0, 82.22248243559729], [4917.0, 80.80588235294117], [4949.0, 137.4371373307542], [4981.0, 826.8657142857138], [2059.0, 89.1141352063215], [2075.0, 99.20781696854154], [2091.0, 139.8682432432432], [2107.0, 572.8510638297872], [2171.0, 134.8368246968028], [2155.0, 531.4792079207919], [2123.0, 31.991725768321487], [2139.0, 103.47619047619045], [2187.0, 46.96693607641441], [2203.0, 60.752830188679184], [2219.0, 63.48085901027082], [2235.0, 182.36999999999995], [2299.0, 45.53348729792148], [2283.0, 185.1712846347606], [2251.0, 87.94730238393994], [2267.0, 122.41783100465734], [2315.0, 262.3716651333944], [2331.0, 237.58160779537093], [2347.0, 72.35483870967741], [2363.0, 48.14921465968591], [2427.0, 157.55858747993568], [2411.0, 387.46845425867514], [2379.0, 337.98467966573804], [2395.0, 46.45485519591144], [2443.0, 39.416313559322035], [2459.0, 90.61019736842111], [2475.0, 35.99554764024932], [2491.0, 220.47254335260126], [2555.0, 103.99330143540669], [2539.0, 89.27675988428162], [2507.0, 100.42490118577075], [2523.0, 81.83185840707962], [2571.0, 601.3720000000002], [2587.0, 91.26927029804729], [2603.0, 113.8994845360825], [2619.0, 89.54374307862686], [2683.0, 291.0424528301886], [2667.0, 58.385775862068925], [2635.0, 238.6851716581443], [2651.0, 80.94695481335953], [2699.0, 277.06882591093114], [2715.0, 60.28787878787892], [2731.0, 172.28991596638656], [2747.0, 56.82756079587332], [2811.0, 285.43342036553554], [2795.0, 108.06846473029037], [2763.0, 41.7677865612648], [2779.0, 190.76096491228077], [2827.0, 166.3747412008283], [2843.0, 130.33738601823728], [2859.0, 218.91388044579548], [2875.0, 473.1162790697674], [2939.0, 78.30105900151274], [2923.0, 211.04322766570607], [2891.0, 51.55897980871419], [2907.0, 248.86491079014516], [2955.0, 71.21322314049591], [2971.0, 779.1886304909568], [2987.0, 242.27124183006532], [3003.0, 651.8024439918532], [3067.0, 317.7883156297422], [3051.0, 342.5931818181821], [3019.0, 57.67236842105268], [3035.0, 51.8942408376964], [3083.0, 132.6373239436619], [3099.0, 160.8607975921745], [3115.0, 68.72546728971953], [3131.0, 133.1864406779657], [3147.0, 174.72320376914016], [3163.0, 48.97197197197191], [3179.0, 134.2629804450437], [3195.0, 207.89186773905286], [3211.0, 79.32478632478632], [3227.0, 298.6916508538902], [3243.0, 197.58881199538627], [3259.0, 93.12499999999993], [3275.0, 176.8639705882353], [3291.0, 271.6488888888892], [3307.0, 94.51318944844131], [3323.0, 500.61550632911417], [3339.0, 165.80588235294118], [3355.0, 66.79876160990713], [3371.0, 63.6150568181818], [3387.0, 445.84196891191675], [3403.0, 404.7959183673465], [3419.0, 340.7019230769236], [3435.0, 393.1118326118328], [3451.0, 128.15046604527282], [3467.0, 247.00888099467173], [3483.0, 28.666666666666668], [3499.0, 70.11369509043926], [3515.0, 83.91405342624856], [3531.0, 655.6815068493148], [3547.0, 136.4808951965068], [3563.0, 89.8909090909091], [3579.0, 36.925106382978704], [3595.0, 166.97451868629648], [3611.0, 250.88843351548329], [3627.0, 3403.4732824427483], [3643.0, 363.64137931034486], [3659.0, 127.71922428330512], [3675.0, 61.93924050632923], [3691.0, 37.67888888888885], [3707.0, 1339.4505494505497], [3723.0, 417.2707240293807], [3739.0, 216.09689677010763], [3755.0, 103.05964535196148], [3771.0, 106.89483227561193], [3787.0, 82.3314285714286], [3803.0, 356.97837837837835], [3819.0, 126.80269058295967], [3835.0, 70.10628394103975], [3851.0, 1516.8680851063823], [3867.0, 79.92441860465114], [3883.0, 554.0823665893281], [3899.0, 444.70279329608974], [3915.0, 226.31935246504747], [3931.0, 506.98843416370045], [3947.0, 329.32584269662925], [3963.0, 72.7194346289753], [3979.0, 76.53637484586929], [3995.0, 63.51338199513385], [4011.0, 82.94187425860025], [4027.0, 383.44547134935283], [4043.0, 76.18703703703704], [4059.0, 186.7003910068428], [4075.0, 85.51704545454541], [4091.0, 98.9333333333334], [4118.0, 478.40051679586554], [4150.0, 229.2110990206746], [4182.0, 32.235924932975884], [4214.0, 2395.7129943502855], [4246.0, 42.329341317365305], [4278.0, 73.08844221105521], [4310.0, 71.5275310834814], [4342.0, 72.30173775671415], [4374.0, 46.85371428571429], [4406.0, 68.3823038397329], [4438.0, 83.53793103448274], [4470.0, 176.4899408284025], [4502.0, 50.22654462242561], [4534.0, 39.80806142034548], [4566.0, 197.70550161812284], [4598.0, 66.43383742911142], [4630.0, 649.8495370370374], [4662.0, 52.01870503597123], [4694.0, 98.50565110565122], [4726.0, 55.050347222222214], [4758.0, 25.273224043715828], [4790.0, 93.84234234234239], [4822.0, 3648.04], [4854.0, 56.70192307692307], [4886.0, 104.68603827073001], [4918.0, 45.74173553719008], [4950.0, 376.74623803009615], [4119.0, 63.103864734299336], [4151.0, 85.82389937106925], [4183.0, 321.42364917775996], [4215.0, 52.29719853836783], [4247.0, 2312.3963607594956], [4279.0, 42.93366708385484], [4311.0, 122.03652968036543], [4343.0, 165.60693153000844], [4375.0, 550.0048859934853], [4407.0, 187.82703321878589], [4439.0, 75.16357504215846], [4471.0, 544.4044380816022], [4503.0, 914.9166666666667], [4535.0, 52.54435483870965], [4567.0, 90.13361169102303], [4599.0, 43.676842105263184], [4631.0, 83.42307692307692], [4663.0, 381.23409941207916], [4695.0, 174.3522727272727], [4727.0, 242.70679277729977], [4759.0, 212.41491085899537], [4791.0, 34.19776714513558], [4823.0, 306.21855235418116], [4855.0, 357.1231671554251], [4887.0, 85.74740810556077], [4919.0, 154.2114068441065], [4951.0, 75.34562211981572], [4983.0, 38.25253312548713], [519.0, 28.98031496062991], [515.0, 44.368055555555586], [527.0, 134.03161141094836], [523.0, 57.6166194523135], [543.0, 89.00448028673836], [539.0, 77.80037664783427], [531.0, 48.72151898734175], [535.0, 78.22123893805309], [551.0, 77.86692381870776], [547.0, 137.16840536512666], [559.0, 1002.345945945946], [555.0, 25.94094488188978], [575.0, 192.61550888529888], [571.0, 47.825842696629245], [563.0, 44.64705882352956], [567.0, 91.68432203389835], [583.0, 33.81849024597115], [579.0, 25.259740259740244], [591.0, 146.39165009940356], [587.0, 90.67100000000005], [607.0, 125.04134366925064], [603.0, 107.91158156911582], [595.0, 105.88641188959659], [599.0, 76.81915772089187], [615.0, 34.65359477124185], [611.0, 88.01258992805757], [623.0, 106.24967061923581], [619.0, 42.41025641025645], [639.0, 90.99908088235298], [635.0, 27.55151515151518], [627.0, 29.627906976744196], [631.0, 325.8741573033708], [647.0, 583.0701754385965], [643.0, 62.014681892332774], [655.0, 36.16379310344826], [651.0, 36.21958456973305], [671.0, 109.11926605504588], [667.0, 76.3719512195122], [659.0, 159.99428571428572], [663.0, 47.59781761496499], [679.0, 270.8651252408477], [675.0, 125.6565874730021], [687.0, 131.8135714285714], [683.0, 186.41035856573706], [703.0, 54.93304535637154], [699.0, 206.86818632309217], [691.0, 64.59130434782607], [695.0, 28.318479685452154], [711.0, 37.73293768545996], [707.0, 55.38788426763117], [719.0, 75.33056478405321], [715.0, 106.49560632688926], [735.0, 281.6624472573839], [731.0, 83.12210338680921], [723.0, 91.36375], [727.0, 105.78737541528244], [743.0, 39.16342756183748], [739.0, 29.502297090352215], [751.0, 57.21236872812139], [747.0, 61.95156950672648], [767.0, 112.58512396694206], [763.0, 71.53103448275864], [755.0, 87.74548581255371], [759.0, 128.1458823529412], [775.0, 49.85600490196074], [771.0, 62.60770577933448], [783.0, 79.94832041343668], [779.0, 44.22758620689656], [799.0, 43.55753424657534], [795.0, 167.32009626955468], [787.0, 49.46768060836504], [791.0, 48.23536036036036], [807.0, 1394.46511627907], [803.0, 97.36910569105689], [815.0, 185.2564655172414], [811.0, 101.96161228406913], [831.0, 161.82142857142856], [827.0, 58.04980079681268], [819.0, 38.468592964824175], [823.0, 133.60676532769554], [839.0, 1235.46875], [835.0, 110.59745762711864], [847.0, 94.703125], [843.0, 119.46153846153842], [863.0, 73.82244143033299], [859.0, 89.58370635631152], [851.0, 125.44777158774373], [855.0, 71.39900662251657], [871.0, 269.30088495575217], [867.0, 178.3255597014924], [879.0, 177.87119437939114], [875.0, 72.7385759829968], [895.0, 48.94285714285714], [891.0, 175.44688026981453], [883.0, 182.65008576329336], [887.0, 57.65454545454547], [903.0, 81.11278195488723], [899.0, 188.23404255319136], [911.0, 214.03640776699035], [907.0, 54.49168474331165], [927.0, 207.77521613832852], [923.0, 112.47714048212808], [915.0, 97.71962616822418], [919.0, 146.67353951890033], [935.0, 109.86568457538989], [931.0, 83.70648464163821], [943.0, 411.61823361823366], [939.0, 147.61138014527842], [959.0, 230.94352941176476], [955.0, 135.48617021276596], [947.0, 90.35151515151504], [951.0, 114.08535031847134], [967.0, 87.01661129568106], [963.0, 60.148194271481856], [975.0, 104.73398058252428], [971.0, 80.07692307692307], [991.0, 110.50767918088728], [987.0, 81.70664365832613], [979.0, 130.43285714285716], [983.0, 64.13399778516053], [999.0, 89.72752808988757], [995.0, 83.13333333333334], [1007.0, 77.02792792792798], [1003.0, 43.34620689655168], [1023.0, 67.67999999999996], [1019.0, 139.5765158806545], [1011.0, 92.73534971644605], [1015.0, 170.93887945670622], [1038.0, 98.0045146726862], [1030.0, 112.15165511932256], [1054.0, 330.69392033542965], [1046.0, 133.1426684280053], [1086.0, 67.16202783300193], [1078.0, 62.941971830985956], [1062.0, 88.3875968992248], [1070.0, 82.42049092849514], [1102.0, 52.79259259259258], [1094.0, 102.37052932761087], [1118.0, 79.45923913043477], [1110.0, 204.27052238805965], [1150.0, 106.15844544095667], [1142.0, 205.55120828538548], [1126.0, 91.58218318695094], [1134.0, 19525.666666666668], [1166.0, 63.606602475928526], [1158.0, 127.48148148148147], [1182.0, 68.0951008645533], [1174.0, 41.27063740856849], [1214.0, 98.39267015706807], [1206.0, 102.81944444444441], [1190.0, 136.601145038168], [1198.0, 125.41128372853643], [1230.0, 158.64468864468864], [1222.0, 62.80676758682086], [1246.0, 32.93835616438359], [1238.0, 217.28696604600228], [1278.0, 115.02609727164884], [1270.0, 935.7348484848485], [1254.0, 93.18129139072857], [1262.0, 156.8318681318681], [1294.0, 173.01912260967387], [1286.0, 53.86876155268028], [1310.0, 227.06100795755964], [1302.0, 167.76767676767673], [1342.0, 132.92460881934568], [1334.0, 34.02461899179371], [1318.0, 94.82899305555557], [1326.0, 121.38349097162514], [1358.0, 105.21803852889666], [1350.0, 94.85294117647061], [1374.0, 74.24999999999991], [1366.0, 199.9382911392405], [1406.0, 122.19624999999994], [1398.0, 44.09317343173433], [1382.0, 116.15476839237041], [1390.0, 33.08013355592658], [1422.0, 97.9860335195531], [1414.0, 151.18685121107268], [1438.0, 41.51410256410253], [1430.0, 109.87410926365807], [1470.0, 241.15079365079364], [1462.0, 131.30965005302218], [1446.0, 74.96987951807229], [1454.0, 200.94015957446803], [1486.0, 58.64662212323681], [1478.0, 135.0403422982887], [1502.0, 84.04904051172714], [1494.0, 1520.9999999999998], [1534.0, 174.8174273858922], [1526.0, 105.21343085106383], [1510.0, 68.98634294385432], [1518.0, 523.9320843091335], [1542.0, 358.2586466165414], [1550.0, 1668.027027027027], [1558.0, 111.57461406518023], [1566.0, 144.11001642036152], [1598.0, 158.46125461254616], [1590.0, 53.37764932562625], [1574.0, 140.4443309499489], [1582.0, 122.65129500947585], [1606.0, 175.687125748503], [1614.0, 33.8660049627792], [1622.0, 152.5544405418965], [1630.0, 108.56632996633002], [1662.0, 53.953229398663666], [1654.0, 226.24404761904765], [1638.0, 231.41306638566917], [1646.0, 35.36029911624745], [1670.0, 55.508414526129386], [1678.0, 112.83636363636367], [1686.0, 237.88909892879659], [1694.0, 150.37541528239203], [1726.0, 239.90211132437656], [1718.0, 75.02814258911825], [1702.0, 138.1287878787879], [1710.0, 45.335130278526485], [1734.0, 38.51650943396225], [1742.0, 47.791124713083406], [1750.0, 104.28158844765352], [1758.0, 133.60227272727258], [1790.0, 123.98449612403098], [1782.0, 71.37080291970803], [1766.0, 303.2725766362884], [1774.0, 203.10665597433837], [1798.0, 77.57845868152282], [1806.0, 149.56280587275697], [1814.0, 77.30598455598454], [1822.0, 75.44870565675932], [1854.0, 203.73701566364377], [1846.0, 298.1224489795918], [1830.0, 108.75], [1838.0, 104.78398983481577], [1862.0, 183.20473876063159], [1870.0, 52.15167548500881], [1878.0, 163.6480686695279], [1886.0, 227.41937984496124], [1918.0, 69.22956521739141], [1910.0, 27.862619808306718], [1894.0, 272.21891191709835], [1902.0, 61.57678355501811], [1926.0, 66.86896551724142], [1934.0, 194.52707182320455], [1942.0, 66.58131868131865], [1950.0, 82.21206896551728], [1982.0, 42.096662830840096], [1974.0, 248.62914485165768], [1958.0, 107.64285714285724], [1966.0, 408.69811320754735], [1990.0, 95.88770053475936], [1998.0, 169.24976525821597], [2006.0, 149.67016491754126], [2014.0, 105.51366120218566], [2046.0, 77.56666666666668], [2038.0, 73.9058171745152], [2022.0, 384.8980213089805], [2030.0, 216.59493670886067], [2060.0, 51.06787330316743], [2076.0, 222.18690783807028], [2092.0, 48.48279689234181], [2108.0, 238.20819112627973], [2172.0, 109.94958968347015], [2156.0, 91.90006752194469], [2124.0, 266.9739130434779], [2140.0, 124.44297719087633], [2188.0, 415.824362606232], [2204.0, 45.5817535545024], [2220.0, 179.27804487179492], [2236.0, 71.23068893528182], [2300.0, 329.0238751147845], [2284.0, 170.15989159891598], [2252.0, 67.98658247829518], [2268.0, 100.74763033175357], [2316.0, 184.03717472118956], [2332.0, 74.85275423728812], [2348.0, 152.4305799648506], [2364.0, 264.0702426564495], [2428.0, 99.2709030100334], [2412.0, 81.18285214348212], [2380.0, 64.30414312617692], [2396.0, 343.4966378482223], [2444.0, 145.756168359942], [2460.0, 806.9197324414712], [2476.0, 484.41071428571433], [2492.0, 58.356241234221514], [2556.0, 123.46419951729686], [2540.0, 110.9564444444444], [2508.0, 215.2068965517242], [2524.0, 55.94684889901291], [2572.0, 130.72464698331186], [2588.0, 49.571428571428555], [2604.0, 1561.7925925925917], [2620.0, 205.62747979426888], [2684.0, 77.63610518834406], [2668.0, 1601.8391608391612], [2636.0, 105.91251885369535], [2652.0, 38.277227722772245], [2700.0, 121.93269230769228], [2716.0, 69.5722488038277], [2732.0, 102.37251984126999], [2748.0, 707.0536779324054], [2812.0, 123.48711554447215], [2796.0, 326.400684931507], [2764.0, 209.39452054794523], [2780.0, 127.67932489451483], [2828.0, 81.81413043478263], [2844.0, 87.31219512195128], [2860.0, 177.85795053003528], [2876.0, 68.7051696284328], [2940.0, 60.08544303797465], [2924.0, 104.23076923076923], [2892.0, 55.79374110953061], [2908.0, 36.69449378330375], [2956.0, 44.112103174603135], [2972.0, 176.0216606498194], [2988.0, 160.6827661909988], [3004.0, 69.80443828016635], [3068.0, 273.52638700947244], [3052.0, 68.8003144654088], [3020.0, 668.3513513513512], [3036.0, 129.05371900826447], [3084.0, 201.62969752520604], [3100.0, 87.82900763358779], [3116.0, 111.24502840909088], [3132.0, 67.6952789699571], [3148.0, 47.63764044943814], [3164.0, 269.3656668793875], [3180.0, 72.51132686084148], [3196.0, 42.6848567530696], [3212.0, 45.12910532276333], [3228.0, 110.57902973395932], [3244.0, 191.27547592385213], [3260.0, 159.47661691542285], [3276.0, 67.2820512820512], [3292.0, 93.29661016949163], [3308.0, 44.65994236311238], [3324.0, 89.64497716894986], [3340.0, 53.192592592592625], [3356.0, 126.09655172413817], [3372.0, 177.67226890756308], [3388.0, 77.84048156508663], [3404.0, 167.65671641791042], [3420.0, 74.74695534506095], [3436.0, 100.58781362007171], [3452.0, 3390.1866883116872], [3468.0, 1409.4903703703715], [3484.0, 46.152023121387266], [3500.0, 1392.2607594936705], [3516.0, 127.76923076923077], [3532.0, 66.30157687253606], [3548.0, 101.95192307692307], [3564.0, 50.3869209809264], [3580.0, 539.3372093023249], [3596.0, 452.91525423728854], [3612.0, 93.48359240069088], [3628.0, 430.38500694122985], [3644.0, 47.31605562579015], [3660.0, 104.53078556263264], [3676.0, 136.22222222222229], [3692.0, 333.6646072374229], [3708.0, 141.53538461538486], [3724.0, 84.77882352941171], [3740.0, 76.97313797313797], [3756.0, 2327.886578449905], [3772.0, 87.07308160779553], [3788.0, 51.47039106145261], [3804.0, 506.1913746630728], [3820.0, 232.07071823204492], [3836.0, 55.09766454352446], [3852.0, 88.39567809239938], [3868.0, 43.975562072336224], [3884.0, 70.79623287671242], [3900.0, 69.84739336492882], [3916.0, 74.9210526315789], [3932.0, 81.7967479674796], [3948.0, 471.6645195920567], [3964.0, 54.24168514412419], [3980.0, 94.78841309823683], [3996.0, 44.3959341723136], [4012.0, 408.68848920863275], [4028.0, 72.30263157894733], [4044.0, 43.94010695187166], [4060.0, 356.7959413754228], [4076.0, 40.124582869855374], [4092.0, 445.5133381398698], [4120.0, 159.81791483113054], [4152.0, 38.62877871825872], [4184.0, 53.8297619047619], [4216.0, 276.02475247524694], [4248.0, 101.70377733598411], [4280.0, 395.7123287671233], [4312.0, 46.14677930306231], [4344.0, 137.45132743362825], [4376.0, 64.27366387636825], [4408.0, 63.752638522427524], [4440.0, 39.34053586862576], [4472.0, 94.61714285714284], [4504.0, 353.51828793774376], [4536.0, 572.7337278106507], [4568.0, 44.723837209302296], [4600.0, 274.9500580720093], [4632.0, 38.8264223722276], [4664.0, 95.34693877551022], [4696.0, 61.89993706733802], [4728.0, 67.22962112514357], [4760.0, 309.85601577909307], [4792.0, 301.1804081632655], [4824.0, 54.47267497603076], [4856.0, 84.98714652956298], [4888.0, 34.97707736389684], [4920.0, 115.21093750000013], [4952.0, 231.64745308310992], [4984.0, 276.390977443609], [4121.0, 93.32129963898922], [4153.0, 596.8359281437123], [4185.0, 146.23908523908534], [4217.0, 62.16192026037432], [4249.0, 38.69583333333332], [4281.0, 157.88223140495856], [4313.0, 1849.8612956810628], [4345.0, 34.29805825242714], [4377.0, 72.63841059602645], [4409.0, 195.63470319634695], [4441.0, 490.3404255319149], [4473.0, 38.6295336787565], [4505.0, 72.97108843537424], [4537.0, 373.29936305732525], [4569.0, 215.71240755957277], [4601.0, 83.34050632911384], [4633.0, 733.7674074074081], [4665.0, 74.72682445759364], [4697.0, 1305.6051502145936], [4729.0, 52.015657620041715], [4761.0, 41.793209876543216], [4793.0, 108.86567164179091], [4825.0, 3304.204225352112], [4857.0, 39.162105263157876], [4889.0, 263.0435555555558], [4921.0, 57.82780979827083], [4953.0, 73.62726556343583], [4985.0, 157.2305418719209], [2061.0, 336.6498673740054], [2077.0, 41.97544338335604], [2093.0, 315.2020287404904], [2109.0, 79.98417132216017], [2173.0, 209.61029411764716], [2157.0, 372.4709507042254], [2125.0, 111.19881305637982], [2141.0, 280.68391451068584], [2189.0, 65.08051948051948], [2205.0, 1019.9658536585367], [2221.0, 80.45599999999995], [2237.0, 186.89970930232587], [2301.0, 162.1864111498258], [2285.0, 55.100407055630946], [2253.0, 329.01912568305994], [2269.0, 50.78368469294226], [2317.0, 53.90201224846891], [2333.0, 344.72134595162964], [2349.0, 193.34755244755263], [2365.0, 75.4978723404254], [2429.0, 54.5441751368256], [2413.0, 35.430232558139465], [2381.0, 299.3992982456141], [2397.0, 162.04492187500006], [2445.0, 91.99917559769167], [2461.0, 68.18503620273525], [2477.0, 166.77162629757757], [2493.0, 96.99158091674462], [2557.0, 130.74456007568588], [2541.0, 46.24193548387095], [2509.0, 176.47003154574128], [2525.0, 155.6315789473682], [2573.0, 55.2151898734177], [2589.0, 219.93755420641764], [2605.0, 96.7422619047621], [2621.0, 182.22396576319548], [2685.0, 84.95643564356432], [2669.0, 89.27208061647912], [2637.0, 59.23258096172723], [2653.0, 315.57982456140326], [2701.0, 42.87834101382492], [2717.0, 328.59767610747974], [2733.0, 3959.777777777778], [2749.0, 71.13947536788241], [2813.0, 37.92348993288589], [2797.0, 76.44724025974024], [2765.0, 91.37848170398699], [2781.0, 102.30603948896633], [2829.0, 46.72459349593496], [2845.0, 105.00265604249677], [2861.0, 92.79320113314449], [2877.0, 45.6830601092896], [2941.0, 226.11381215469586], [2925.0, 92.52241537053969], [2893.0, 312.86188271604925], [2909.0, 153.37796143250688], [2957.0, 66.5585106382979], [2973.0, 138.31720078482638], [2989.0, 358.5372516556296], [3005.0, 164.08607594936734], [3069.0, 43.17140151515144], [3053.0, 891.2591888466417], [3021.0, 58.91031822565097], [3037.0, 71.74724467303463], [3085.0, 46.410764872521206], [3101.0, 41.743883792048955], [3117.0, 84.45695364238415], [3133.0, 148.31011450381686], [3149.0, 361.99791666666647], [3165.0, 62.84615384615385], [3181.0, 95.28104575163401], [3197.0, 121.39545454545461], [3213.0, 179.88209606986896], [3229.0, 70.59072164948444], [3245.0, 171.44987775061108], [3261.0, 330.8950276243094], [3277.0, 247.28791377983063], [3293.0, 68.31590181430099], [3309.0, 339.64428312159697], [3325.0, 47.16779170684668], [3341.0, 172.88393489030415], [3357.0, 67.35344827586208], [3373.0, 103.83333333333329], [3389.0, 565.9485801995402], [3405.0, 57.630700064226055], [3421.0, 45.2868480725623], [3437.0, 38.4801026957638], [3453.0, 35.57799043062197], [3469.0, 132.46674514420246], [3485.0, 1179.7404505386862], [3501.0, 520.4640967498102], [3517.0, 158.52658959537558], [3533.0, 95.68106312292358], [3549.0, 40.33104395604394], [3565.0, 322.8696925329429], [3581.0, 176.73608098336973], [3597.0, 183.44390715667296], [3613.0, 42.25767918088737], [3629.0, 340.9477707006372], [3645.0, 200.70410958904094], [3661.0, 38.612987012987034], [3677.0, 75.38235294117648], [3693.0, 89.07692307692305], [3709.0, 48.78817204301078], [3725.0, 51.18723404255321], [3741.0, 144.25393081761018], [3757.0, 159.68606513614532], [3773.0, 47.83006535947708], [3789.0, 68.7450110864745], [3805.0, 241.93627954779004], [3821.0, 280.29300411522604], [3837.0, 171.48967889908255], [3853.0, 44.244274809160316], [3869.0, 325.39064327485374], [3885.0, 55.07393364928907], [3901.0, 58.97389330306467], [3917.0, 41.67878077373969], [3933.0, 53.04295942720768], [3949.0, 247.94516129032226], [3965.0, 522.38127090301], [3981.0, 904.062541583501], [3997.0, 109.8529411764706], [4013.0, 49.749063670411964], [4029.0, 69.06931608133085], [4045.0, 771.0076190476192], [4061.0, 75.33746130030947], [4077.0, 317.27223719676556], [4093.0, 82.25793103448278], [4122.0, 49.740376740376846], [4154.0, 74.87807377049172], [4186.0, 336.0762376237622], [4218.0, 47.74307545367716], [4250.0, 316.7949308755759], [4282.0, 285.19301470588226], [4314.0, 144.7678355501815], [4346.0, 1045.5508771929801], [4378.0, 94.8699386503067], [4410.0, 88.95716395864116], [4442.0, 192.21544715447115], [4474.0, 139.09630146545717], [4506.0, 272.691446028513], [4538.0, 52.50213980028532], [4570.0, 78.36442516268976], [4602.0, 40.678807947019884], [4634.0, 76.99817184643523], [4666.0, 191.6083499005967], [4698.0, 87.41754122938518], [4730.0, 260.37881873727076], [4762.0, 114.68219461697723], [4794.0, 45.081660899653905], [4826.0, 145.62802768166074], [4858.0, 58.04270462633452], [4890.0, 134.11036339165543], [4922.0, 458.3752122241085], [4954.0, 220.5827107790824], [4986.0, 338.005847953216], [4123.0, 362.98672566371675], [4155.0, 37.81384471468663], [4187.0, 52.92530120481927], [4219.0, 1915.2707838479805], [4251.0, 246.40648648648641], [4283.0, 230.32686567164166], [4315.0, 39.40559440559443], [4347.0, 103.54651162790694], [4379.0, 52.50273224043717], [4411.0, 45.25813008130082], [4443.0, 231.9287652645858], [4475.0, 94.17219917012453], [4507.0, 98.79456706281829], [4539.0, 1043.309148264984], [4571.0, 41.74010327022371], [4603.0, 1168.4962025316447], [4635.0, 42.09796314258], [4667.0, 216.6587225929457], [4699.0, 136.0271281571562], [4731.0, 1377.0674418604658], [4763.0, 291.4692982456142], [4795.0, 531.9569620253156], [4827.0, 437.71752951861924], [4859.0, 173.1659574468083], [4891.0, 158.60706401766006], [4923.0, 113.09123222748815], [4955.0, 72.9887737478411], [4987.0, 120.15397631133668], [1039.0, 20.981912144702818], [1031.0, 128.0295420974889], [1055.0, 49.504132231404945], [1047.0, 68.49957301451755], [1087.0, 86.4807692307693], [1079.0, 109.93458781362006], [1063.0, 94.34451612903226], [1071.0, 122.43616029822925], [1103.0, 67.51698513800426], [1095.0, 86.35939470365707], [1119.0, 108.29084588644264], [1111.0, 68.87166831194467], [1151.0, 66.06355591311342], [1143.0, 64.77813163481956], [1127.0, 96.09608540925271], [1135.0, 59.6833558863329], [1167.0, 1044.3222222222223], [1159.0, 153.62361382909327], [1183.0, 138.55688622754494], [1175.0, 305.5228571428571], [1215.0, 426.7081081081081], [1207.0, 144.09966777408644], [1191.0, 147.73148148148158], [1199.0, 125.83686440677965], [1231.0, 98.09982688978646], [1223.0, 233.58571428571423], [1247.0, 97.46511627906989], [1239.0, 111.39494949494954], [1279.0, 75.90700483091783], [1271.0, 56.483922829581964], [1255.0, 118.57374830852504], [1263.0, 131.96465116279077], [1295.0, 105.17560617193251], [1287.0, 243.9413265306123], [1311.0, 119.69219105382886], [1303.0, 125.05038759689907], [1343.0, 408.6186440677965], [1335.0, 276.92609351432884], [1319.0, 251.00453857791234], [1327.0, 186.7342733188721], [1359.0, 116.90674846625765], [1351.0, 544.3536121673003], [1375.0, 93.48516320474778], [1367.0, 85.17391304347822], [1407.0, 163.37569060773475], [1399.0, 127.74603174603176], [1383.0, 159.2753488372092], [1391.0, 108.10323159784564], [1423.0, 99.03355704697982], [1415.0, 104.46725663716803], [1439.0, 131.51313131313134], [1431.0, 104.6531932093775], [1471.0, 95.10000000000005], [1463.0, 117.50777202072535], [1447.0, 140.79572192513353], [1455.0, 124.97465034965036], [1487.0, 78.83914209115275], [1479.0, 306.6864784546806], [1503.0, 30.72398190045247], [1495.0, 60.22936357908001], [1535.0, 70.6762028608583], [1527.0, 93.73295454545455], [1511.0, 64.83198707592895], [1519.0, 154.72096420745075], [1543.0, 43.00683760683759], [1551.0, 83.05341880341884], [1559.0, 38.26621621621622], [1567.0, 624.3813953488373], [1599.0, 1721.5833333333335], [1591.0, 193.81445993031352], [1575.0, 129.02309236947792], [1583.0, 264.3935860058309], [1607.0, 114.07588739290088], [1615.0, 182.4374999999998], [1623.0, 81.96551724137936], [1631.0, 104.00726392251819], [1663.0, 176.43743641912528], [1655.0, 230.8489822718317], [1639.0, 83.34547591069335], [1647.0, 550.8064516129032], [1671.0, 65.80305602716467], [1679.0, 165.06776180698168], [1687.0, 59.261484098939945], [1695.0, 170.00901803607198], [1727.0, 48.90743155149936], [1719.0, 289.11330698287225], [1703.0, 179.33203124999986], [1711.0, 42.86615886833518], [1735.0, 819.0214592274676], [1743.0, 58.85447263017356], [1751.0, 269.6382488479266], [1759.0, 42.68201754385961], [1791.0, 56.62973158981416], [1783.0, 48.17720207253888], [1767.0, 41.28869778869776], [1775.0, 199.1649214659687], [1799.0, 74.07156673114115], [1807.0, 50.94003241491087], [1815.0, 185.6736842105263], [1823.0, 176.02967359050444], [1855.0, 126.13778256189441], [1847.0, 145.06563965170838], [1831.0, 51.37939110070249], [1839.0, 77.40924464487036], [1863.0, 3131.4], [1871.0, 265.05510907003435], [1879.0, 57.813238770685516], [1887.0, 95.17515923566883], [1919.0, 149.50747663551394], [1911.0, 190.33684950773554], [1895.0, 76.82214765100673], [1903.0, 227.1445147679326], [1927.0, 56.73501805054148], [1935.0, 113.51252408477835], [1943.0, 540.9098837209307], [1951.0, 219.14485165794056], [1983.0, 179.9832268370607], [1975.0, 76.27441406250001], [1959.0, 41.176470588235276], [1967.0, 124.43839346494221], [1991.0, 47.73285841495992], [1999.0, 50.72275132275128], [2007.0, 166.0545454545454], [2015.0, 66.25071633237822], [2047.0, 423.5037037037039], [2039.0, 89.45352112676048], [2023.0, 82.83398821218069], [2031.0, 83.5076219512196], [2062.0, 67.58309859154936], [2078.0, 171.57956015523934], [2094.0, 108.61616161616165], [2110.0, 606.8698630136985], [2174.0, 140.24881516587675], [2158.0, 166.15151515151518], [2126.0, 52.08488612836441], [2142.0, 83.87924970691671], [2190.0, 62.01185344827582], [2206.0, 91.81866464339896], [2222.0, 54.51911468812872], [2238.0, 137.17269076305223], [2302.0, 191.1715210355987], [2286.0, 179.178187403994], [2254.0, 90.74965229485399], [2270.0, 145.1435028248587], [2318.0, 214.44972067039114], [2334.0, 49.35836177474398], [2350.0, 465.1891891891892], [2366.0, 237.5626204238921], [2430.0, 179.15091066782318], [2414.0, 129.10000000000002], [2382.0, 87.98004434589791], [2398.0, 48.86063750926604], [2446.0, 150.91111111111113], [2462.0, 421.84860248447177], [2478.0, 55.80683311432329], [2494.0, 193.47551342811997], [2558.0, 35.422697368421034], [2542.0, 73.69230769230761], [2510.0, 97.1937751004016], [2526.0, 126.5851648351648], [2574.0, 3042.186991869918], [2590.0, 79.02521008403363], [2606.0, 76.309375], [2622.0, 75.17723244717106], [2686.0, 335.0384068278805], [2670.0, 152.4583606557375], [2638.0, 1191.3129251700677], [2654.0, 87.29015544041451], [2702.0, 319.45533769063184], [2718.0, 50.24125230202578], [2734.0, 110.98638613861382], [2750.0, 147.24508426966304], [2814.0, 194.20499999999998], [2798.0, 176.55417066155326], [2766.0, 141.70650406504038], [2782.0, 126.38630136986298], [2830.0, 192.34771886559784], [2846.0, 322.78342407743486], [2862.0, 36.691948658109645], [2878.0, 448.36054421768694], [2942.0, 61.048586572438076], [2926.0, 4194.921637426902], [2894.0, 58.6497005988024], [2910.0, 89.29861111111109], [2958.0, 275.951612903226], [2974.0, 230.24397824397846], [2990.0, 66.5615171137835], [3006.0, 79.24796747967491], [3070.0, 2065.403773584905], [3054.0, 81.66596194503175], [3022.0, 2545.0000000000005], [3038.0, 77.31146605818597], [3086.0, 197.98937784521988], [3102.0, 1780.766278272791], [3118.0, 51.919842312746454], [3134.0, 182.39742619227854], [3150.0, 90.6532663316583], [3166.0, 165.21077959576508], [3182.0, 124.19066403681799], [3198.0, 146.6006787330317], [3214.0, 210.22420634920633], [3230.0, 233.63675582398602], [3246.0, 29.679648241206053], [3262.0, 205.18335343787695], [3278.0, 60.82638888888884], [3294.0, 705.3822815533977], [3310.0, 56.31656804733743], [3326.0, 417.4509803921569], [3342.0, 47.015625], [3358.0, 60.24237685691946], [3374.0, 52.422222222222196], [3390.0, 84.28964401294499], [3406.0, 277.9385245901638], [3422.0, 750.9679144385027], [3438.0, 442.6061705989109], [3454.0, 476.84674329501905], [3470.0, 100.16447368421052], [3486.0, 118.66158868335161], [3502.0, 464.6659751037344], [3518.0, 207.39140955837848], [3534.0, 151.26102292768974], [3550.0, 167.01974612129746], [3566.0, 62.347826086956545], [3582.0, 62.52136752136758], [3598.0, 48.85264483627206], [3614.0, 67.77519379844968], [3630.0, 72.11213235294122], [3646.0, 118.78791208791205], [3662.0, 227.5264270613106], [3678.0, 53.631524008350794], [3694.0, 39.34072022160665], [3710.0, 1368.0612244897964], [3726.0, 64.00586854460096], [3742.0, 90.35839160839157], [3758.0, 668.6683467741939], [3774.0, 245.19653179190763], [3790.0, 94.9227467811159], [3806.0, 40.36272040302267], [3822.0, 79.91790040376863], [3838.0, 48.2538860103628], [3854.0, 582.4719101123596], [3870.0, 65.58255813953477], [3886.0, 381.1136363636363], [3902.0, 523.0075075075079], [3918.0, 309.91717417783195], [3934.0, 184.53146067415727], [3950.0, 57.42688330871489], [3966.0, 3376.9358006042316], [3982.0, 617.6383386581468], [3998.0, 690.5430944963646], [4014.0, 43.6915017462165], [4030.0, 217.18092354277056], [4046.0, 138.23645970937898], [4062.0, 819.4237089201877], [4078.0, 69.91026392961878], [4094.0, 236.14605647517024], [4124.0, 113.5230547550431], [4156.0, 84.49523809523808], [4188.0, 761.3189655172414], [4220.0, 72.05737704918022], [4252.0, 69.19012345679016], [4284.0, 161.2621225983535], [4316.0, 204.49664429530185], [4348.0, 1777.014964788732], [4380.0, 1730.1765075376863], [4412.0, 165.87300319488799], [4444.0, 68.00378787878797], [4476.0, 39.88479262672814], [4508.0, 47.969086021505404], [4540.0, 426.4400958466459], [4572.0, 259.85005767012683], [4604.0, 403.2779740871611], [4636.0, 161.76506024096386], [4668.0, 96.25500000000001], [4700.0, 95.37018425460627], [4732.0, 252.83490566037716], [4764.0, 2836.329490874162], [4796.0, 62.98486682808712], [4828.0, 92.81887366818876], [4860.0, 154.90915805022138], [4924.0, 63.32662538699689], [4956.0, 242.05061801059412], [4988.0, 108.0007892659826], [4125.0, 107.75799086757992], [4157.0, 619.0564166150036], [4189.0, 101.70372596153872], [4221.0, 1560.118226600985], [4253.0, 655.1604278074873], [4285.0, 94.12801932367145], [4317.0, 77.992700729927], [4349.0, 298.3019801980196], [4381.0, 81.6704871060172], [4413.0, 48.11543450064856], [4445.0, 40.81861575178996], [4477.0, 181.69197707736407], [4509.0, 166.09645669291302], [4541.0, 52.922882427307215], [4573.0, 79.64060913705579], [4605.0, 86.10223642172521], [4637.0, 106.72526780088225], [4669.0, 83.87116564417195], [4701.0, 84.86032863849776], [4733.0, 81.878125], [4765.0, 118.17142857142856], [4797.0, 259.215291750503], [4829.0, 42.42549371633742], [4861.0, 81.95833333333334], [4893.0, 238.33587370713144], [4925.0, 143.44117647058835], [4957.0, 92.64353312302835], [4989.0, 340.76109215017084], [2063.0, 49.29172141918527], [2079.0, 143.6992031872509], [2095.0, 56.26666666666662], [2111.0, 120.61664564943258], [2175.0, 121.87904360056254], [2159.0, 46.23674911660778], [2127.0, 201.72920892494943], [2143.0, 42.15508021390371], [2191.0, 297.2181818181817], [2207.0, 47.74378378378377], [2223.0, 706.3516483516484], [2239.0, 55.04482390608325], [2303.0, 226.42777155655133], [2287.0, 36.305105853051096], [2255.0, 62.11688311688313], [2271.0, 97.78059071729952], [2319.0, 174.16024340770795], [2335.0, 340.51882057716443], [2351.0, 47.46123650637878], [2367.0, 205.63076923076915], [2431.0, 76.11887477313977], [2415.0, 192.33271945979098], [2383.0, 42.79452054794519], [2399.0, 260.45531400966206], [2447.0, 81.14058355437676], [2463.0, 123.4810126582278], [2479.0, 83.65388127853883], [2495.0, 230.69543973941364], [2559.0, 51.10329670329674], [2543.0, 2002.5387755102047], [2511.0, 345.4957627118647], [2527.0, 38.5902712815716], [2575.0, 101.57963163596962], [2591.0, 58.57078215901749], [2607.0, 155.2431326709529], [2623.0, 86.72], [2687.0, 49.03483606557374], [2671.0, 90.31884057971011], [2639.0, 209.6264108352145], [2655.0, 214.4220183486242], [2703.0, 72.94971145919213], [2719.0, 315.0871694417238], [2735.0, 116.37962128043293], [2751.0, 86.3988165680472], [2815.0, 77.56302521008398], [2799.0, 76.29929851909587], [2767.0, 78.24561403508773], [2783.0, 61.0869565217391], [2831.0, 69.39586410635151], [2847.0, 91.42783505154638], [2863.0, 251.60913242009127], [2879.0, 118.67812061711074], [2943.0, 248.17094972067042], [2927.0, 196.22061855670108], [2895.0, 61.04820936639116], [2911.0, 47.2994011976048], [2959.0, 56.13426423200852], [2975.0, 76.14594594594594], [2991.0, 44.3769441903019], [3007.0, 53.35776277724214], [3071.0, 73.93791044776117], [3055.0, 42.702346041055726], [3023.0, 193.21763708309797], [3039.0, 104.98969072164951], [3087.0, 73.48477157360405], [3103.0, 34.68541666666664], [3119.0, 113.16037735849055], [3135.0, 40.81551976573937], [3151.0, 213.6312542837564], [3167.0, 99.95634920634924], [3183.0, 35.52464228934814], [3199.0, 47.865528281750265], [3215.0, 126.14691358024686], [3231.0, 94.09494949494953], [3247.0, 300.80662983425407], [3263.0, 158.49961685823752], [3279.0, 31.85544217687075], [3295.0, 107.60040983606554], [3311.0, 599.2033898305084], [3327.0, 164.36275773195808], [3343.0, 223.91056910569094], [3359.0, 169.45658263305302], [3375.0, 222.7231638418079], [3391.0, 49.33037475345161], [3407.0, 76.37027863777085], [3423.0, 71.05504019789733], [3439.0, 107.2570281124496], [3455.0, 108.50173812282745], [3471.0, 39.124999999999964], [3487.0, 41.61479869423288], [3503.0, 162.03784693019375], [3519.0, 73.92000000000003], [3535.0, 40.99754901960786], [3551.0, 86.93041237113405], [3567.0, 43.05309734513283], [3583.0, 775.6822308690026], [3599.0, 622.7065556711761], [3615.0, 214.42857142857125], [3631.0, 174.9008620689657], [3647.0, 688.875862068965], [3663.0, 103.95006934812763], [3679.0, 848.5542857142858], [3695.0, 224.63842975206583], [3711.0, 426.7390728476825], [3727.0, 247.66099476439797], [3743.0, 175.915644171779], [3759.0, 80.60827250608274], [3775.0, 78.5560344827586], [3791.0, 51.08888888888887], [3807.0, 171.98665183537264], [3823.0, 60.52135493372598], [3839.0, 47.820121951219484], [3855.0, 60.24594745667961], [3871.0, 33.60810810810804], [3887.0, 112.12986445124632], [3903.0, 48.92842535787319], [3919.0, 276.96762257169354], [3935.0, 88.75534441805223], [3951.0, 62.011862396204045], [3967.0, 270.77289836888326], [3983.0, 87.97658862876256], [3999.0, 207.7089804186357], [4015.0, 966.1370143149268], [4031.0, 47.3209393346379], [4047.0, 680.1564986737401], [4063.0, 74.62305025996523], [4079.0, 150.17698470502555], [4095.0, 77.7655719139298], [4126.0, 124.89773844641088], [4158.0, 213.1763934426231], [4190.0, 229.32924226254062], [4222.0, 203.64098939929363], [4254.0, 186.63727454909812], [4286.0, 42.87640449438204], [4318.0, 37.69082672706685], [4350.0, 353.6077684691549], [4382.0, 360.724856321839], [4414.0, 1160.948256467942], [4446.0, 351.9827462257368], [4478.0, 89.16525423728817], [4510.0, 98.74999999999999], [4542.0, 105.97630799605123], [4574.0, 48.8838028169014], [4606.0, 5027.878378378378], [4638.0, 1517.0083565459593], [4670.0, 83.95644599303147], [4702.0, 235.8561244329233], [4734.0, 48.79429559204839], [4766.0, 94.67493796526055], [4798.0, 88.37931034482746], [4830.0, 212.57877094972073], [4862.0, 56.76757188498404], [4894.0, 156.94736842105257], [4926.0, 317.0539215686279], [4958.0, 55.433333333333415], [4990.0, 42.85891647855529], [4127.0, 50.380237154150215], [4159.0, 117.89772727272727], [4191.0, 82.72972972972971], [4223.0, 204.269139700079], [4255.0, 435.1338066630266], [4287.0, 225.28438818565408], [4319.0, 356.84896872920876], [4351.0, 47.76496478873239], [4383.0, 95.23853211009177], [4415.0, 71.24027459954227], [4447.0, 191.79885057471262], [4479.0, 53.246550137994426], [4511.0, 34.58129175946549], [4543.0, 74.9481481481482], [4575.0, 1298.1416666666667], [4607.0, 3352.016877637132], [4639.0, 84.0096711798839], [4671.0, 42.72792607802872], [4703.0, 41.251256281407045], [4735.0, 1352.8740808823527], [4767.0, 332.9733110925773], [4799.0, 41.695796460177014], [4831.0, 4775.3031423290095], [4863.0, 280.38255547054297], [4895.0, 122.2173913043478], [4927.0, 43.9040348964013], [4959.0, 230.88888888888943], [4991.0, 271.94524714828873], [1.0, 116188.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[3838.5440201860783, 240.8665282201385]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 5000.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 0.0, "minX": 1.53091974E12, "maxY": 1.57137103E7, "series": [{"data": [[1.53091992E12, 1.4270890733333332E7], [1.5309204E12, 20.516666666666666], [1.5309201E12, 1.51003462E7], [1.5309198E12, 1.3758645666666666E7], [1.53092028E12, 1.5088907966666667E7], [1.53091998E12, 1.4600094233333332E7], [1.53092016E12, 1.57137103E7], [1.53091986E12, 1.37378215E7], [1.53092034E12, 370476.2], [1.53092004E12, 1.4213727E7], [1.53091974E12, 1.1068575316666666E7], [1.53092022E12, 1.46750002E7]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.53091992E12, 2860495.1], [1.5309204E12, 0.0], [1.5309201E12, 2946011.433333333], [1.5309198E12, 2841897.0], [1.53092028E12, 3021326.533333333], [1.53091998E12, 2855822.3333333335], [1.53092016E12, 2872771.65], [1.53091986E12, 2810714.7333333334], [1.53092034E12, 73062.3], [1.53092004E12, 2823357.066666667], [1.53091974E12, 2355569.4833333334], [1.53092022E12, 2961184.6666666665]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5309204E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 37.89065045679098, "minX": 1.53091974E12, "maxY": 116188.0, "series": [{"data": [[1.53091992E12, 197.87089981800395], [1.5309204E12, 116188.0], [1.5309201E12, 306.21745915945127], [1.5309198E12, 93.4591783385466], [1.53092028E12, 292.56182181953653], [1.53091998E12, 253.20558907996644], [1.53092016E12, 303.47656669780855], [1.53091986E12, 145.24141368185343], [1.53092034E12, 4149.0086824129785], [1.53092004E12, 306.38223896985176], [1.53091974E12, 37.89065045679098], [1.53092022E12, 316.4951865080813]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5309204E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 0.0, "minX": 1.53091974E12, "maxY": 3604.5664554357727, "series": [{"data": [[1.53091992E12, 166.42118656622085], [1.5309204E12, 0.0], [1.5309201E12, 208.1006254864311], [1.5309198E12, 92.64924643483104], [1.53092028E12, 198.34708520089796], [1.53091998E12, 185.42487962166152], [1.53092016E12, 212.54173873196805], [1.53091986E12, 140.00180678871018], [1.53092034E12, 3604.5664554357727], [1.53092004E12, 196.94840598471612], [1.53091974E12, 37.887890759686535], [1.53092022E12, 189.47429473349408]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5309204E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.025326833941773423, "minX": 1.53091974E12, "maxY": 1.14265238390533, "series": [{"data": [[1.53091992E12, 0.15308756930630438], [1.5309204E12, 1.0], [1.5309201E12, 0.8665933748834259], [1.5309198E12, 0.06258778837436661], [1.53092028E12, 0.37632531833675886], [1.53091998E12, 1.14265238390533], [1.53092016E12, 0.4723390924740494], [1.53091986E12, 0.11551829536434996], [1.53092034E12, 0.5343181631141466], [1.53092004E12, 0.33774667504048395], [1.53091974E12, 0.025326833941773423], [1.53092022E12, 0.5423928584239983]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5309204E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 1.0, "minX": 1.53091974E12, "maxY": 70083.0, "series": [{"data": [[1.53091992E12, 58505.0], [1.5309201E12, 70083.0], [1.5309198E12, 28083.0], [1.53092028E12, 59932.0], [1.53091998E12, 59425.0], [1.53092016E12, 67165.0], [1.53091986E12, 54578.0], [1.53092034E12, 59297.0], [1.53092004E12, 59463.0], [1.53091974E12, 1202.0], [1.53092022E12, 59623.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.53091992E12, 1.0], [1.5309201E12, 1.0], [1.5309198E12, 1.0], [1.53092028E12, 1.0], [1.53091998E12, 1.0], [1.53092016E12, 1.0], [1.53091986E12, 1.0], [1.53092034E12, 1.0], [1.53092004E12, 1.0], [1.53091974E12, 1.0], [1.53092022E12, 1.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.53091992E12, 142.0], [1.5309201E12, 131.0], [1.5309198E12, 132.0], [1.53092028E12, 113.0], [1.53091998E12, 144.0], [1.53092016E12, 115.0], [1.53091986E12, 151.0], [1.53092034E12, 14510.0], [1.53092004E12, 128.0], [1.53091974E12, 127.90000000000146], [1.53092022E12, 113.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.53091992E12, 1329.0], [1.5309201E12, 1398.9900000000016], [1.5309198E12, 1020.0], [1.53092028E12, 2611.9900000000016], [1.53091998E12, 1926.0], [1.53092016E12, 1239.9900000000016], [1.53091986E12, 1916.0], [1.53092034E12, 57527.0], [1.53092004E12, 4265.0], [1.53091974E12, 330.0], [1.53092022E12, 4168.980000000003]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.53091992E12, 872.0], [1.5309201E12, 699.0], [1.5309198E12, 704.9000000000015], [1.53092028E12, 1061.9000000000015], [1.53091998E12, 754.0], [1.53092016E12, 129.0], [1.53091986E12, 1191.0], [1.53092034E12, 29525.900000000016], [1.53092004E12, 969.9500000000007], [1.53091974E12, 158.0], [1.53092022E12, 775.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53092034E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 0.0, "minX": 0.0, "maxY": 116188.0, "series": [{"data": [[16403.0, 61.0], [16439.0, 48.0], [16643.0, 49.0], [12664.0, 54.0], [405.0, 53.0], [15349.0, 49.0], [15460.0, 50.0], [15751.0, 59.0], [15604.0, 54.0], [15883.0, 57.0], [16261.0, 52.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[16403.0, 1.0], [16439.0, 2.0], [16643.0, 2.0], [0.0, 116188.0], [405.0, 66.0], [15349.0, 1.0], [15460.0, 0.0], [15751.0, 2.0], [15604.0, 2.0], [15883.0, 1.0], [16261.0, 4.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16643.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 0.0, "minX": 0.0, "maxY": 61.0, "series": [{"data": [[16403.0, 61.0], [16439.0, 48.0], [16643.0, 49.0], [12664.0, 54.0], [405.0, 53.0], [15349.0, 49.0], [15460.0, 50.0], [15751.0, 59.0], [15604.0, 54.0], [15883.0, 57.0], [16261.0, 52.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[16403.0, 0.0], [16439.0, 0.0], [16643.0, 0.0], [0.0, 0.0], [405.0, 0.0], [15349.0, 0.0], [15460.0, 0.0], [15751.0, 0.0], [15604.0, 0.0], [15883.0, 0.0], [16261.0, 0.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16643.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 343.31666666666666, "minX": 1.53091974E12, "maxY": 16639.233333333334, "series": [{"data": [[1.53091992E12, 15765.733333333334], [1.5309201E12, 16398.216666666667], [1.5309198E12, 15478.083333333334], [1.53092028E12, 16639.233333333334], [1.53091998E12, 15904.5], [1.53092016E12, 16449.25], [1.53091986E12, 15360.283333333333], [1.53092034E12, 343.31666666666666], [1.53092004E12, 15606.733333333334], [1.53091974E12, 12664.45], [1.53092022E12, 16257.816666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53092034E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.53091974E12, "maxY": 16244.516666666666, "series": [{"data": [[1.53091992E12, 15380.033333333333], [1.5309201E12, 15840.7], [1.5309198E12, 15279.966666666667], [1.53092028E12, 16244.516666666666], [1.53091998E12, 15355.583333333334], [1.53092016E12, 15448.75], [1.53091986E12, 15112.15], [1.53092034E12, 392.9], [1.53092004E12, 15180.3], [1.53091974E12, 12664.433333333332], [1.53092022E12, 15921.1]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.53091992E12, 371.3], [1.5309201E12, 562.5333333333333], [1.5309198E12, 180.98333333333332], [1.53092028E12, 399.28333333333336], [1.53091998E12, 528.3666666666667], [1.53092016E12, 990.8166666666667], [1.53091986E12, 237.36666666666667], [1.53092034E12, 12.133333333333333], [1.53092004E12, 423.9], [1.53092022E12, 340.48333333333335]], "isOverall": false, "label": "Non HTTP response code: org.apache.http.NoHttpResponseException", "isController": false}, {"data": [[1.5309204E12, 0.016666666666666666]], "isOverall": false, "label": "Non HTTP response code: org.apache.http.ConnectionClosedException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5309204E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.53091974E12, "maxY": 16244.516666666666, "series": [{"data": [[1.53091992E12, 15380.033333333333], [1.5309201E12, 15840.7], [1.5309198E12, 15279.966666666667], [1.53092028E12, 16244.516666666666], [1.53091998E12, 15355.583333333334], [1.53092016E12, 15448.75], [1.53091986E12, 15112.15], [1.53092034E12, 392.9], [1.53092004E12, 15180.3], [1.53091974E12, 12664.433333333332], [1.53092022E12, 15921.1]], "isOverall": false, "label": "HTTP Request-success", "isController": false}, {"data": [[1.53091992E12, 371.3], [1.5309204E12, 0.016666666666666666], [1.5309201E12, 562.5333333333333], [1.5309198E12, 180.98333333333332], [1.53092028E12, 399.28333333333336], [1.53091998E12, 528.3666666666667], [1.53092016E12, 990.8166666666667], [1.53091986E12, 237.36666666666667], [1.53092034E12, 12.133333333333333], [1.53092004E12, 423.9], [1.53092022E12, 340.48333333333335]], "isOverall": false, "label": "HTTP Request-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5309204E12, "title": "Transactions Per Second"}},
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
