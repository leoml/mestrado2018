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
        data: {"result": {"minY": 0.0, "minX": 0.0, "maxY": 1080.0, "series": [{"data": [[0.0, 0.0], [0.1, 1.0], [0.2, 1.0], [0.3, 1.0], [0.4, 1.0], [0.5, 1.0], [0.6, 1.0], [0.7, 1.0], [0.8, 1.0], [0.9, 1.0], [1.0, 1.0], [1.1, 1.0], [1.2, 1.0], [1.3, 1.0], [1.4, 1.0], [1.5, 1.0], [1.6, 1.0], [1.7, 1.0], [1.8, 1.0], [1.9, 1.0], [2.0, 1.0], [2.1, 1.0], [2.2, 1.0], [2.3, 1.0], [2.4, 1.0], [2.5, 1.0], [2.6, 1.0], [2.7, 1.0], [2.8, 1.0], [2.9, 1.0], [3.0, 1.0], [3.1, 2.0], [3.2, 2.0], [3.3, 2.0], [3.4, 2.0], [3.5, 2.0], [3.6, 2.0], [3.7, 2.0], [3.8, 2.0], [3.9, 2.0], [4.0, 2.0], [4.1, 2.0], [4.2, 2.0], [4.3, 2.0], [4.4, 2.0], [4.5, 2.0], [4.6, 2.0], [4.7, 2.0], [4.8, 2.0], [4.9, 2.0], [5.0, 2.0], [5.1, 2.0], [5.2, 2.0], [5.3, 2.0], [5.4, 2.0], [5.5, 2.0], [5.6, 2.0], [5.7, 2.0], [5.8, 2.0], [5.9, 2.0], [6.0, 2.0], [6.1, 2.0], [6.2, 2.0], [6.3, 2.0], [6.4, 2.0], [6.5, 2.0], [6.6, 2.0], [6.7, 2.0], [6.8, 2.0], [6.9, 2.0], [7.0, 2.0], [7.1, 2.0], [7.2, 2.0], [7.3, 2.0], [7.4, 2.0], [7.5, 2.0], [7.6, 2.0], [7.7, 2.0], [7.8, 2.0], [7.9, 2.0], [8.0, 2.0], [8.1, 2.0], [8.2, 2.0], [8.3, 3.0], [8.4, 3.0], [8.5, 3.0], [8.6, 3.0], [8.7, 3.0], [8.8, 3.0], [8.9, 3.0], [9.0, 3.0], [9.1, 3.0], [9.2, 3.0], [9.3, 3.0], [9.4, 3.0], [9.5, 3.0], [9.6, 3.0], [9.7, 3.0], [9.8, 3.0], [9.9, 3.0], [10.0, 3.0], [10.1, 3.0], [10.2, 3.0], [10.3, 3.0], [10.4, 3.0], [10.5, 3.0], [10.6, 3.0], [10.7, 3.0], [10.8, 3.0], [10.9, 3.0], [11.0, 3.0], [11.1, 3.0], [11.2, 3.0], [11.3, 3.0], [11.4, 3.0], [11.5, 3.0], [11.6, 3.0], [11.7, 3.0], [11.8, 3.0], [11.9, 3.0], [12.0, 3.0], [12.1, 3.0], [12.2, 3.0], [12.3, 3.0], [12.4, 3.0], [12.5, 3.0], [12.6, 3.0], [12.7, 3.0], [12.8, 3.0], [12.9, 3.0], [13.0, 3.0], [13.1, 3.0], [13.2, 3.0], [13.3, 4.0], [13.4, 4.0], [13.5, 4.0], [13.6, 4.0], [13.7, 4.0], [13.8, 4.0], [13.9, 4.0], [14.0, 4.0], [14.1, 4.0], [14.2, 4.0], [14.3, 4.0], [14.4, 4.0], [14.5, 4.0], [14.6, 4.0], [14.7, 4.0], [14.8, 4.0], [14.9, 4.0], [15.0, 4.0], [15.1, 4.0], [15.2, 4.0], [15.3, 4.0], [15.4, 4.0], [15.5, 4.0], [15.6, 4.0], [15.7, 4.0], [15.8, 4.0], [15.9, 4.0], [16.0, 4.0], [16.1, 4.0], [16.2, 4.0], [16.3, 4.0], [16.4, 4.0], [16.5, 4.0], [16.6, 4.0], [16.7, 4.0], [16.8, 4.0], [16.9, 4.0], [17.0, 4.0], [17.1, 4.0], [17.2, 4.0], [17.3, 4.0], [17.4, 4.0], [17.5, 4.0], [17.6, 5.0], [17.7, 5.0], [17.8, 5.0], [17.9, 5.0], [18.0, 5.0], [18.1, 5.0], [18.2, 5.0], [18.3, 5.0], [18.4, 5.0], [18.5, 5.0], [18.6, 5.0], [18.7, 5.0], [18.8, 5.0], [18.9, 5.0], [19.0, 5.0], [19.1, 5.0], [19.2, 5.0], [19.3, 5.0], [19.4, 5.0], [19.5, 5.0], [19.6, 5.0], [19.7, 5.0], [19.8, 5.0], [19.9, 5.0], [20.0, 5.0], [20.1, 5.0], [20.2, 5.0], [20.3, 5.0], [20.4, 5.0], [20.5, 5.0], [20.6, 5.0], [20.7, 5.0], [20.8, 5.0], [20.9, 5.0], [21.0, 5.0], [21.1, 5.0], [21.2, 5.0], [21.3, 5.0], [21.4, 6.0], [21.5, 6.0], [21.6, 6.0], [21.7, 6.0], [21.8, 6.0], [21.9, 6.0], [22.0, 6.0], [22.1, 6.0], [22.2, 6.0], [22.3, 6.0], [22.4, 6.0], [22.5, 6.0], [22.6, 6.0], [22.7, 6.0], [22.8, 6.0], [22.9, 6.0], [23.0, 6.0], [23.1, 6.0], [23.2, 6.0], [23.3, 6.0], [23.4, 6.0], [23.5, 6.0], [23.6, 6.0], [23.7, 6.0], [23.8, 6.0], [23.9, 6.0], [24.0, 6.0], [24.1, 6.0], [24.2, 6.0], [24.3, 6.0], [24.4, 6.0], [24.5, 6.0], [24.6, 6.0], [24.7, 7.0], [24.8, 7.0], [24.9, 7.0], [25.0, 7.0], [25.1, 7.0], [25.2, 7.0], [25.3, 7.0], [25.4, 7.0], [25.5, 7.0], [25.6, 7.0], [25.7, 7.0], [25.8, 7.0], [25.9, 7.0], [26.0, 7.0], [26.1, 7.0], [26.2, 7.0], [26.3, 7.0], [26.4, 7.0], [26.5, 7.0], [26.6, 7.0], [26.7, 7.0], [26.8, 7.0], [26.9, 7.0], [27.0, 7.0], [27.1, 7.0], [27.2, 7.0], [27.3, 8.0], [27.4, 8.0], [27.5, 8.0], [27.6, 8.0], [27.7, 8.0], [27.8, 8.0], [27.9, 8.0], [28.0, 8.0], [28.1, 8.0], [28.2, 8.0], [28.3, 8.0], [28.4, 8.0], [28.5, 8.0], [28.6, 8.0], [28.7, 8.0], [28.8, 8.0], [28.9, 8.0], [29.0, 8.0], [29.1, 8.0], [29.2, 8.0], [29.3, 8.0], [29.4, 8.0], [29.5, 8.0], [29.6, 8.0], [29.7, 8.0], [29.8, 8.0], [29.9, 9.0], [30.0, 9.0], [30.1, 9.0], [30.2, 9.0], [30.3, 9.0], [30.4, 9.0], [30.5, 9.0], [30.6, 9.0], [30.7, 9.0], [30.8, 9.0], [30.9, 9.0], [31.0, 9.0], [31.1, 9.0], [31.2, 9.0], [31.3, 9.0], [31.4, 9.0], [31.5, 9.0], [31.6, 9.0], [31.7, 9.0], [31.8, 9.0], [31.9, 9.0], [32.0, 9.0], [32.1, 9.0], [32.2, 9.0], [32.3, 9.0], [32.4, 9.0], [32.5, 10.0], [32.6, 10.0], [32.7, 10.0], [32.8, 10.0], [32.9, 10.0], [33.0, 10.0], [33.1, 10.0], [33.2, 10.0], [33.3, 10.0], [33.4, 10.0], [33.5, 10.0], [33.6, 10.0], [33.7, 10.0], [33.8, 10.0], [33.9, 10.0], [34.0, 10.0], [34.1, 10.0], [34.2, 10.0], [34.3, 10.0], [34.4, 10.0], [34.5, 10.0], [34.6, 10.0], [34.7, 10.0], [34.8, 10.0], [34.9, 10.0], [35.0, 10.0], [35.1, 11.0], [35.2, 11.0], [35.3, 11.0], [35.4, 11.0], [35.5, 11.0], [35.6, 11.0], [35.7, 11.0], [35.8, 11.0], [35.9, 11.0], [36.0, 11.0], [36.1, 11.0], [36.2, 11.0], [36.3, 11.0], [36.4, 11.0], [36.5, 11.0], [36.6, 11.0], [36.7, 11.0], [36.8, 11.0], [36.9, 11.0], [37.0, 11.0], [37.1, 11.0], [37.2, 11.0], [37.3, 11.0], [37.4, 11.0], [37.5, 11.0], [37.6, 11.0], [37.7, 11.0], [37.8, 12.0], [37.9, 12.0], [38.0, 12.0], [38.1, 12.0], [38.2, 12.0], [38.3, 12.0], [38.4, 12.0], [38.5, 12.0], [38.6, 12.0], [38.7, 12.0], [38.8, 12.0], [38.9, 12.0], [39.0, 12.0], [39.1, 12.0], [39.2, 12.0], [39.3, 12.0], [39.4, 12.0], [39.5, 12.0], [39.6, 12.0], [39.7, 12.0], [39.8, 12.0], [39.9, 12.0], [40.0, 12.0], [40.1, 12.0], [40.2, 12.0], [40.3, 13.0], [40.4, 13.0], [40.5, 13.0], [40.6, 13.0], [40.7, 13.0], [40.8, 13.0], [40.9, 13.0], [41.0, 13.0], [41.1, 13.0], [41.2, 13.0], [41.3, 13.0], [41.4, 13.0], [41.5, 13.0], [41.6, 13.0], [41.7, 13.0], [41.8, 13.0], [41.9, 13.0], [42.0, 13.0], [42.1, 13.0], [42.2, 13.0], [42.3, 13.0], [42.4, 13.0], [42.5, 13.0], [42.6, 13.0], [42.7, 14.0], [42.8, 14.0], [42.9, 14.0], [43.0, 14.0], [43.1, 14.0], [43.2, 14.0], [43.3, 14.0], [43.4, 14.0], [43.5, 14.0], [43.6, 14.0], [43.7, 14.0], [43.8, 14.0], [43.9, 14.0], [44.0, 14.0], [44.1, 14.0], [44.2, 14.0], [44.3, 14.0], [44.4, 14.0], [44.5, 14.0], [44.6, 14.0], [44.7, 14.0], [44.8, 15.0], [44.9, 15.0], [45.0, 15.0], [45.1, 15.0], [45.2, 15.0], [45.3, 15.0], [45.4, 15.0], [45.5, 15.0], [45.6, 15.0], [45.7, 15.0], [45.8, 15.0], [45.9, 15.0], [46.0, 15.0], [46.1, 15.0], [46.2, 15.0], [46.3, 15.0], [46.4, 15.0], [46.5, 15.0], [46.6, 15.0], [46.7, 15.0], [46.8, 16.0], [46.9, 16.0], [47.0, 16.0], [47.1, 16.0], [47.2, 16.0], [47.3, 16.0], [47.4, 16.0], [47.5, 16.0], [47.6, 16.0], [47.7, 16.0], [47.8, 16.0], [47.9, 16.0], [48.0, 16.0], [48.1, 16.0], [48.2, 16.0], [48.3, 16.0], [48.4, 16.0], [48.5, 16.0], [48.6, 16.0], [48.7, 16.0], [48.8, 17.0], [48.9, 17.0], [49.0, 17.0], [49.1, 17.0], [49.2, 17.0], [49.3, 17.0], [49.4, 17.0], [49.5, 17.0], [49.6, 17.0], [49.7, 17.0], [49.8, 17.0], [49.9, 17.0], [50.0, 17.0], [50.1, 17.0], [50.2, 17.0], [50.3, 17.0], [50.4, 17.0], [50.5, 17.0], [50.6, 17.0], [50.7, 17.0], [50.8, 17.0], [50.9, 17.0], [51.0, 17.0], [51.1, 17.0], [51.2, 18.0], [51.3, 18.0], [51.4, 18.0], [51.5, 18.0], [51.6, 18.0], [51.7, 18.0], [51.8, 18.0], [51.9, 18.0], [52.0, 18.0], [52.1, 18.0], [52.2, 18.0], [52.3, 18.0], [52.4, 18.0], [52.5, 18.0], [52.6, 18.0], [52.7, 18.0], [52.8, 18.0], [52.9, 18.0], [53.0, 18.0], [53.1, 18.0], [53.2, 18.0], [53.3, 18.0], [53.4, 18.0], [53.5, 18.0], [53.6, 18.0], [53.7, 18.0], [53.8, 18.0], [53.9, 18.0], [54.0, 18.0], [54.1, 18.0], [54.2, 18.0], [54.3, 18.0], [54.4, 18.0], [54.5, 19.0], [54.6, 19.0], [54.7, 19.0], [54.8, 19.0], [54.9, 19.0], [55.0, 19.0], [55.1, 19.0], [55.2, 19.0], [55.3, 19.0], [55.4, 19.0], [55.5, 19.0], [55.6, 19.0], [55.7, 19.0], [55.8, 19.0], [55.9, 19.0], [56.0, 19.0], [56.1, 19.0], [56.2, 19.0], [56.3, 19.0], [56.4, 19.0], [56.5, 19.0], [56.6, 19.0], [56.7, 19.0], [56.8, 19.0], [56.9, 19.0], [57.0, 19.0], [57.1, 19.0], [57.2, 19.0], [57.3, 19.0], [57.4, 19.0], [57.5, 19.0], [57.6, 19.0], [57.7, 19.0], [57.8, 19.0], [57.9, 19.0], [58.0, 20.0], [58.1, 20.0], [58.2, 20.0], [58.3, 20.0], [58.4, 20.0], [58.5, 20.0], [58.6, 20.0], [58.7, 20.0], [58.8, 20.0], [58.9, 20.0], [59.0, 20.0], [59.1, 20.0], [59.2, 20.0], [59.3, 20.0], [59.4, 20.0], [59.5, 20.0], [59.6, 20.0], [59.7, 20.0], [59.8, 20.0], [59.9, 20.0], [60.0, 20.0], [60.1, 20.0], [60.2, 20.0], [60.3, 20.0], [60.4, 20.0], [60.5, 20.0], [60.6, 20.0], [60.7, 20.0], [60.8, 20.0], [60.9, 20.0], [61.0, 20.0], [61.1, 20.0], [61.2, 21.0], [61.3, 21.0], [61.4, 21.0], [61.5, 21.0], [61.6, 21.0], [61.7, 21.0], [61.8, 21.0], [61.9, 21.0], [62.0, 21.0], [62.1, 21.0], [62.2, 21.0], [62.3, 21.0], [62.4, 21.0], [62.5, 21.0], [62.6, 21.0], [62.7, 21.0], [62.8, 21.0], [62.9, 21.0], [63.0, 21.0], [63.1, 21.0], [63.2, 21.0], [63.3, 21.0], [63.4, 21.0], [63.5, 21.0], [63.6, 21.0], [63.7, 21.0], [63.8, 21.0], [63.9, 21.0], [64.0, 21.0], [64.1, 22.0], [64.2, 22.0], [64.3, 22.0], [64.4, 22.0], [64.5, 22.0], [64.6, 22.0], [64.7, 22.0], [64.8, 22.0], [64.9, 22.0], [65.0, 22.0], [65.1, 22.0], [65.2, 22.0], [65.3, 22.0], [65.4, 22.0], [65.5, 22.0], [65.6, 22.0], [65.7, 22.0], [65.8, 22.0], [65.9, 22.0], [66.0, 22.0], [66.1, 22.0], [66.2, 22.0], [66.3, 22.0], [66.4, 22.0], [66.5, 23.0], [66.6, 23.0], [66.7, 23.0], [66.8, 23.0], [66.9, 23.0], [67.0, 23.0], [67.1, 23.0], [67.2, 23.0], [67.3, 23.0], [67.4, 23.0], [67.5, 23.0], [67.6, 23.0], [67.7, 23.0], [67.8, 23.0], [67.9, 23.0], [68.0, 23.0], [68.1, 24.0], [68.2, 24.0], [68.3, 24.0], [68.4, 24.0], [68.5, 24.0], [68.6, 24.0], [68.7, 24.0], [68.8, 24.0], [68.9, 24.0], [69.0, 24.0], [69.1, 24.0], [69.2, 25.0], [69.3, 25.0], [69.4, 25.0], [69.5, 25.0], [69.6, 25.0], [69.7, 25.0], [69.8, 25.0], [69.9, 26.0], [70.0, 26.0], [70.1, 26.0], [70.2, 26.0], [70.3, 26.0], [70.4, 26.0], [70.5, 27.0], [70.6, 27.0], [70.7, 27.0], [70.8, 27.0], [70.9, 28.0], [71.0, 28.0], [71.1, 28.0], [71.2, 29.0], [71.3, 29.0], [71.4, 29.0], [71.5, 30.0], [71.6, 30.0], [71.7, 31.0], [71.8, 31.0], [71.9, 32.0], [72.0, 34.0], [72.1, 35.0], [72.2, 38.0], [72.3, 43.0], [72.4, 49.0], [72.5, 50.0], [72.6, 51.0], [72.7, 51.0], [72.8, 52.0], [72.9, 52.0], [73.0, 52.0], [73.1, 53.0], [73.2, 53.0], [73.3, 53.0], [73.4, 53.0], [73.5, 54.0], [73.6, 54.0], [73.7, 54.0], [73.8, 54.0], [73.9, 54.0], [74.0, 55.0], [74.1, 55.0], [74.2, 55.0], [74.3, 55.0], [74.4, 55.0], [74.5, 56.0], [74.6, 56.0], [74.7, 56.0], [74.8, 56.0], [74.9, 56.0], [75.0, 56.0], [75.1, 57.0], [75.2, 57.0], [75.3, 57.0], [75.4, 57.0], [75.5, 57.0], [75.6, 57.0], [75.7, 58.0], [75.8, 58.0], [75.9, 58.0], [76.0, 58.0], [76.1, 58.0], [76.2, 58.0], [76.3, 58.0], [76.4, 59.0], [76.5, 59.0], [76.6, 59.0], [76.7, 59.0], [76.8, 59.0], [76.9, 59.0], [77.0, 59.0], [77.1, 60.0], [77.2, 60.0], [77.3, 60.0], [77.4, 60.0], [77.5, 60.0], [77.6, 60.0], [77.7, 60.0], [77.8, 61.0], [77.9, 61.0], [78.0, 61.0], [78.1, 61.0], [78.2, 61.0], [78.3, 61.0], [78.4, 61.0], [78.5, 62.0], [78.6, 62.0], [78.7, 62.0], [78.8, 62.0], [78.9, 62.0], [79.0, 62.0], [79.1, 62.0], [79.2, 63.0], [79.3, 63.0], [79.4, 63.0], [79.5, 63.0], [79.6, 63.0], [79.7, 63.0], [79.8, 63.0], [79.9, 64.0], [80.0, 64.0], [80.1, 64.0], [80.2, 64.0], [80.3, 64.0], [80.4, 64.0], [80.5, 64.0], [80.6, 65.0], [80.7, 65.0], [80.8, 65.0], [80.9, 65.0], [81.0, 65.0], [81.1, 65.0], [81.2, 65.0], [81.3, 66.0], [81.4, 66.0], [81.5, 66.0], [81.6, 66.0], [81.7, 66.0], [81.8, 66.0], [81.9, 66.0], [82.0, 67.0], [82.1, 67.0], [82.2, 67.0], [82.3, 67.0], [82.4, 67.0], [82.5, 67.0], [82.6, 67.0], [82.7, 68.0], [82.8, 68.0], [82.9, 68.0], [83.0, 68.0], [83.1, 68.0], [83.2, 68.0], [83.3, 68.0], [83.4, 69.0], [83.5, 69.0], [83.6, 69.0], [83.7, 69.0], [83.8, 69.0], [83.9, 69.0], [84.0, 69.0], [84.1, 70.0], [84.2, 70.0], [84.3, 70.0], [84.4, 70.0], [84.5, 70.0], [84.6, 70.0], [84.7, 70.0], [84.8, 71.0], [84.9, 71.0], [85.0, 71.0], [85.1, 71.0], [85.2, 71.0], [85.3, 71.0], [85.4, 71.0], [85.5, 72.0], [85.6, 72.0], [85.7, 72.0], [85.8, 72.0], [85.9, 72.0], [86.0, 72.0], [86.1, 72.0], [86.2, 73.0], [86.3, 73.0], [86.4, 73.0], [86.5, 73.0], [86.6, 73.0], [86.7, 73.0], [86.8, 73.0], [86.9, 74.0], [87.0, 74.0], [87.1, 74.0], [87.2, 74.0], [87.3, 74.0], [87.4, 74.0], [87.5, 74.0], [87.6, 75.0], [87.7, 75.0], [87.8, 75.0], [87.9, 75.0], [88.0, 75.0], [88.1, 75.0], [88.2, 76.0], [88.3, 76.0], [88.4, 76.0], [88.5, 76.0], [88.6, 76.0], [88.7, 76.0], [88.8, 76.0], [88.9, 77.0], [89.0, 77.0], [89.1, 77.0], [89.2, 77.0], [89.3, 77.0], [89.4, 77.0], [89.5, 77.0], [89.6, 78.0], [89.7, 78.0], [89.8, 78.0], [89.9, 78.0], [90.0, 78.0], [90.1, 78.0], [90.2, 79.0], [90.3, 79.0], [90.4, 79.0], [90.5, 79.0], [90.6, 79.0], [90.7, 79.0], [90.8, 79.0], [90.9, 80.0], [91.0, 80.0], [91.1, 80.0], [91.2, 80.0], [91.3, 80.0], [91.4, 80.0], [91.5, 80.0], [91.6, 81.0], [91.7, 81.0], [91.8, 81.0], [91.9, 81.0], [92.0, 81.0], [92.1, 81.0], [92.2, 82.0], [92.3, 82.0], [92.4, 82.0], [92.5, 82.0], [92.6, 82.0], [92.7, 82.0], [92.8, 83.0], [92.9, 83.0], [93.0, 83.0], [93.1, 83.0], [93.2, 83.0], [93.3, 83.0], [93.4, 84.0], [93.5, 84.0], [93.6, 84.0], [93.7, 84.0], [93.8, 84.0], [93.9, 84.0], [94.0, 85.0], [94.1, 85.0], [94.2, 85.0], [94.3, 85.0], [94.4, 85.0], [94.5, 85.0], [94.6, 86.0], [94.7, 86.0], [94.8, 86.0], [94.9, 86.0], [95.0, 86.0], [95.1, 86.0], [95.2, 87.0], [95.3, 87.0], [95.4, 87.0], [95.5, 87.0], [95.6, 87.0], [95.7, 88.0], [95.8, 88.0], [95.9, 88.0], [96.0, 88.0], [96.1, 88.0], [96.2, 89.0], [96.3, 89.0], [96.4, 89.0], [96.5, 89.0], [96.6, 89.0], [96.7, 90.0], [96.8, 90.0], [96.9, 90.0], [97.0, 90.0], [97.1, 90.0], [97.2, 91.0], [97.3, 91.0], [97.4, 91.0], [97.5, 91.0], [97.6, 92.0], [97.7, 92.0], [97.8, 92.0], [97.9, 92.0], [98.0, 93.0], [98.1, 93.0], [98.2, 93.0], [98.3, 94.0], [98.4, 94.0], [98.5, 95.0], [98.6, 95.0], [98.7, 95.0], [98.8, 96.0], [98.9, 96.0], [99.0, 97.0], [99.1, 97.0], [99.2, 98.0], [99.3, 99.0], [99.4, 100.0], [99.5, 101.0], [99.6, 103.0], [99.7, 104.0], [99.8, 107.0], [99.9, 114.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 4.0, "minX": 0.0, "maxY": 1.535441E7, "series": [{"data": [[0.0, 1.535441E7], [300.0, 112.0], [200.0, 978.0], [100.0, 98131.0], [400.0, 4.0], [1000.0, 4.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 1000.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 4.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1.5453566E7, "series": [{"data": [[1.0, 4.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 69.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 1.5453566E7]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 64.81422791638508, "minX": 1.53079458E12, "maxY": 1000.0, "series": [{"data": [[1.53079518E12, 999.4998430832763], [1.53079488E12, 980.9704917623189], [1.53079458E12, 64.81422791638508], [1.53079506E12, 1000.0], [1.53079476E12, 612.0028573561738], [1.53079494E12, 1000.0], [1.53079464E12, 212.53532774740034], [1.53079512E12, 1000.0], [1.53079482E12, 812.3333537200973], [1.530795E12, 1000.0], [1.5307947E12, 412.6430909398665]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53079518E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 0.9082125603864741, "minX": 1.0, "maxY": 45.193014426727466, "series": [{"data": [[2.0, 1.294444444444444], [3.0, 0.9554285714285714], [4.0, 0.9082125603864741], [5.0, 1.0919175911251975], [6.0, 1.1100217864923754], [7.0, 0.9154228855721389], [8.0, 1.1840897501274905], [9.0, 1.126706484641636], [10.0, 1.0677045619116599], [11.0, 1.1073170731707302], [12.0, 1.0727383863080657], [13.0, 1.1139277389277387], [14.0, 1.1663303545690376], [15.0, 1.3223995271867592], [16.0, 1.128027681660895], [17.0, 1.284335727109511], [18.0, 1.1339886187273693], [19.0, 1.3352003446790175], [20.0, 1.162253903598099], [21.0, 1.4232828870779968], [22.0, 1.3682771194165912], [23.0, 1.1990407673860946], [24.0, 1.4453974895397512], [25.0, 1.4423876871880172], [26.0, 1.5417989417989424], [27.0, 1.3431164317435806], [28.0, 1.5384903539988775], [29.0, 1.540500736377026], [30.0, 1.534802985592781], [31.0, 1.6025525795434146], [32.0, 1.6044878383007881], [33.0, 1.6337189520244988], [34.0, 1.7118037812979023], [35.0, 1.8421994468846588], [36.0, 1.58623124448367], [37.0, 1.8492479888072788], [38.0, 1.6439999999999997], [39.0, 1.6668609734771245], [40.0, 2.0041949015811595], [41.0, 1.8332742735648437], [42.0, 1.9185459940652791], [43.0, 1.7878872844525497], [44.0, 1.8941532258064524], [45.0, 2.1894253554502394], [46.0, 1.8794729542302389], [47.0, 2.1202725724020506], [48.0, 2.032786885245902], [49.0, 2.1282282282282305], [50.0, 2.4303818301514157], [51.0, 1.9975619666802182], [52.0, 2.12486222642103], [53.0, 2.3244192328471174], [54.0, 2.17348148148147], [55.0, 2.268414810910514], [56.0, 2.285342717258262], [57.0, 2.2655388952966797], [58.0, 2.5073309159703503], [59.0, 2.3619851624456336], [60.0, 2.6809663930617873], [61.0, 2.120753811067093], [62.0, 2.7353605298810746], [63.0, 2.339800664451834], [64.0, 2.497204524769206], [65.0, 2.9535741737125276], [66.0, 2.369611558503074], [67.0, 2.7904734073641153], [68.0, 2.5456786741542183], [69.0, 2.6089425981873102], [70.0, 2.9660480506401914], [71.0, 2.5931839527707], [72.0, 3.0941425049888482], [73.0, 2.7224953902888758], [74.0, 2.659907834101376], [75.0, 3.128157894736838], [76.0, 3.2970845481049533], [77.0, 2.8115183246073334], [78.0, 3.2481667864845445], [79.0, 3.093281510272075], [80.0, 3.6221435942798204], [81.0, 3.2281613123718387], [82.0, 4.059897129583532], [83.0, 3.2325581395348886], [84.0, 3.49177538287011], [85.0, 3.107176018039532], [86.0, 3.3779331003494777], [87.0, 3.6072486250176254], [88.0, 3.046176237099767], [89.0, 3.3788235294117666], [90.0, 3.6891256225788682], [91.0, 3.5621776504297986], [92.0, 3.2442080378250724], [93.0, 3.5534110220927397], [94.0, 3.7026333558406597], [95.0, 3.374680306905363], [96.0, 3.7453605825699046], [97.0, 4.038524208566098], [98.0, 3.258721324826937], [99.0, 3.8679745493107105], [100.0, 3.3437825182101935], [101.0, 3.7559397788755664], [102.0, 3.804582843713269], [103.0, 4.10652409312398], [104.0, 3.918022287690518], [105.0, 3.643593519882169], [106.0, 4.381523621073457], [107.0, 4.878168689506827], [108.0, 3.8613701355215646], [109.0, 4.464834276475342], [110.0, 4.670317002881846], [111.0, 3.745654273297913], [112.0, 4.930188124632562], [113.0, 4.351195125761594], [114.0, 4.6953459889773415], [115.0, 4.416626736942987], [116.0, 5.586627623230838], [117.0, 4.357958778246828], [118.0, 5.945838380342619], [119.0, 4.426030314418168], [120.0, 5.643231233137613], [121.0, 4.1992820893674905], [122.0, 5.1337923585797105], [123.0, 4.7426944402817375], [124.0, 5.075858720718549], [125.0, 5.940968312691009], [126.0, 4.715897817460295], [127.0, 6.021601429267481], [128.0, 4.727387569479518], [129.0, 6.286846788545555], [130.0, 4.838766966890785], [131.0, 6.029132168046633], [132.0, 5.461497820631338], [133.0, 6.350877192982452], [134.0, 4.979208167330686], [135.0, 5.834326406045656], [136.0, 4.679462571976972], [137.0, 5.4066429418742485], [138.0, 5.162288239626798], [139.0, 6.039854014598524], [140.0, 4.9252373946770245], [141.0, 5.513997627520762], [142.0, 6.8237467866323795], [143.0, 4.779539641943749], [144.0, 5.582454060462353], [145.0, 5.763573609451764], [146.0, 6.509836311758502], [147.0, 4.728754225012067], [148.0, 5.490865954922922], [149.0, 5.875645661157008], [150.0, 5.827449738800076], [151.0, 6.165995260663519], [152.0, 6.159353970390319], [153.0, 5.4818442067199005], [154.0, 6.296234904096604], [155.0, 5.653869083104817], [156.0, 6.0839905362775974], [157.0, 6.206702412868626], [158.0, 5.309460536805742], [159.0, 6.0112372841258335], [160.0, 6.012553292278517], [161.0, 6.1638688016528755], [162.0, 6.344947735191635], [163.0, 6.206882699517939], [164.0, 5.303077475751383], [165.0, 6.066359119943218], [166.0, 6.214935602032393], [167.0, 6.401949467743982], [168.0, 6.365549993582329], [169.0, 6.383119359349168], [170.0, 5.703943030462884], [171.0, 6.755668398677417], [172.0, 6.270845939731343], [173.0, 6.509563886763586], [174.0, 7.038078340384864], [175.0, 5.830387760485356], [176.0, 6.875530910807008], [177.0, 6.569803009910654], [178.0, 7.510632265381358], [179.0, 6.349789201686365], [180.0, 6.75502720605629], [181.0, 6.737489549743241], [182.0, 7.262270765911551], [183.0, 6.641420118343193], [184.0, 7.157217103708955], [185.0, 6.779771037412969], [186.0, 7.750487058168672], [187.0, 7.66639299397919], [188.0, 6.259511711488393], [189.0, 7.440998303852667], [190.0, 7.459105346744253], [191.0, 8.11443210930826], [192.0, 6.33296716709385], [193.0, 7.777446226532372], [194.0, 8.264815344975649], [195.0, 6.5472901168968995], [196.0, 7.706146572104004], [197.0, 7.460541079665913], [198.0, 8.48930635838151], [199.0, 6.680068322165302], [200.0, 8.006749555950254], [201.0, 7.721031695110999], [202.0, 8.283429831816928], [203.0, 6.691272485010006], [204.0, 7.6399101548646255], [205.0, 8.132525697503704], [206.0, 8.743611584327134], [207.0, 7.083276263525559], [208.0, 8.022358925825136], [209.0, 7.634062684801917], [210.0, 8.903822098679626], [211.0, 8.19894240388737], [212.0, 7.386268155083442], [213.0, 8.174211086160064], [214.0, 8.33255603057389], [215.0, 9.018107121119893], [216.0, 7.203595724003904], [217.0, 8.233660323838802], [218.0, 8.555190106564906], [219.0, 8.939644481190568], [220.0, 7.863405088062621], [221.0, 8.675999510942638], [222.0, 9.536983530771469], [223.0, 8.676058166709955], [224.0, 7.653552987460092], [225.0, 10.04524180967237], [226.0, 8.57648907298956], [227.0, 9.71261378413525], [228.0, 9.373471307619912], [229.0, 9.92045601761883], [230.0, 9.102774274905443], [231.0, 10.607718894009219], [232.0, 9.192007797270946], [233.0, 8.403712903647543], [234.0, 10.787874423963144], [235.0, 8.738886551675769], [236.0, 9.487453024609048], [237.0, 9.86092899986045], [238.0, 9.581943879625909], [239.0, 8.563806245389708], [240.0, 11.357187208941312], [241.0, 8.183109707971544], [242.0, 9.069395017793601], [243.0, 9.055884442339561], [244.0, 10.220726405833691], [245.0, 9.90115254237288], [246.0, 8.331830703731516], [247.0, 9.179535765040228], [248.0, 10.992383963213134], [249.0, 10.130175913396513], [250.0, 8.029288702928831], [251.0, 9.833530805687195], [252.0, 10.579534364979793], [253.0, 9.016419645451899], [254.0, 9.863431419079284], [255.0, 9.709661951570384], [257.0, 8.958709839357393], [256.0, 12.506714123928148], [258.0, 9.608540925266924], [259.0, 10.29539115420378], [260.0, 11.378362658135773], [261.0, 8.601040118870733], [262.0, 11.272440115819919], [263.0, 11.570315944158677], [264.0, 8.547916409051583], [270.0, 11.146448087431729], [271.0, 11.454210377091046], [268.0, 9.998456057007104], [269.0, 10.28976060677886], [265.0, 10.111914641375217], [266.0, 10.982802633346786], [267.0, 10.248526967819892], [273.0, 11.950594693504149], [272.0, 8.81826022671269], [274.0, 10.240598027127007], [275.0, 10.463690872751503], [276.0, 9.504460466821458], [277.0, 11.483203533651093], [278.0, 10.019512195121948], [279.0, 11.389893179950715], [280.0, 9.412829594647816], [286.0, 11.441844646986821], [287.0, 10.469774217042945], [284.0, 9.714073707642887], [285.0, 10.972524812394086], [281.0, 10.677664372181336], [282.0, 11.593533184971855], [283.0, 12.646135623334317], [289.0, 12.11712749615974], [288.0, 10.808765886684863], [290.0, 11.785460992907721], [291.0, 9.685084376701107], [292.0, 11.161960132890346], [293.0, 12.314932126696807], [294.0, 11.814337012900632], [295.0, 10.76447715595059], [296.0, 13.22210767468502], [302.0, 10.451999999999968], [303.0, 12.432656936038926], [300.0, 11.650710088148854], [301.0, 12.287592440427273], [297.0, 11.18868515906603], [298.0, 10.598424127156632], [299.0, 11.24279444905707], [305.0, 13.772086679799964], [304.0, 11.724561403508742], [306.0, 10.155750190403678], [307.0, 12.351764847608708], [308.0, 12.237962223995746], [309.0, 13.198545143346161], [310.0, 10.292059553349882], [311.0, 11.681429589171243], [312.0, 12.211614048434129], [318.0, 13.123273480662949], [319.0, 11.63784333672433], [316.0, 12.900999589209965], [317.0, 14.115794693776325], [313.0, 13.54170616113743], [314.0, 11.712827988338198], [315.0, 13.242123609062912], [321.0, 12.750639193863726], [320.0, 13.386357472199615], [322.0, 13.338976879664989], [323.0, 15.24151882975409], [324.0, 11.33026332857696], [325.0, 14.813068420316242], [326.0, 11.867259216086259], [327.0, 13.958624066593254], [328.0, 15.448460087994981], [334.0, 13.137210682492597], [335.0, 13.541157727031313], [332.0, 14.245860230143146], [333.0, 12.253949847804018], [329.0, 11.878718825167754], [330.0, 16.165473349244223], [331.0, 12.56313816724831], [337.0, 11.609585492227932], [336.0, 14.24414062500004], [338.0, 15.204628999319276], [339.0, 12.285030656497682], [340.0, 13.965787598004276], [341.0, 17.302486415280793], [342.0, 11.313107102308583], [343.0, 14.372296537067122], [344.0, 14.29471347301233], [350.0, 12.410137638962349], [351.0, 14.661902352643587], [348.0, 14.959193301096768], [349.0, 15.768097774992201], [345.0, 12.254611010955454], [346.0, 15.996174863387983], [347.0, 12.590019423278084], [353.0, 12.556772779997404], [352.0, 15.557282415630535], [354.0, 15.440978425175244], [355.0, 13.944926279271492], [356.0, 12.931995133819939], [357.0, 13.965837759536413], [358.0, 14.326257131484706], [359.0, 14.559858194709598], [360.0, 12.55963541666668], [366.0, 15.303153468815708], [367.0, 13.002770466823627], [364.0, 12.785370182555791], [365.0, 14.497708978328161], [361.0, 14.87296169890023], [362.0, 14.700267737617104], [363.0, 14.32459276916961], [369.0, 15.469692959237706], [368.0, 13.857074967328082], [370.0, 15.05907115697987], [371.0, 12.651918192755], [372.0, 14.123230641132388], [373.0, 14.717939692596484], [374.0, 15.0985422740525], [375.0, 14.507231404958631], [376.0, 12.596545903129456], [382.0, 17.112046924349546], [383.0, 14.26838235294121], [380.0, 13.04982888432582], [381.0, 15.629700142789167], [377.0, 14.556307911617886], [378.0, 14.993378326754135], [379.0, 15.527927182457544], [385.0, 15.820392890551906], [384.0, 16.09014795274687], [386.0, 13.293907302984435], [387.0, 14.790938280413815], [388.0, 15.27385552043095], [389.0, 15.950108459869808], [390.0, 13.58245866283243], [391.0, 16.179792684379834], [392.0, 16.1412489949076], [398.0, 15.22729439809295], [399.0, 15.41830231965344], [396.0, 17.28804664723032], [397.0, 14.082491803278721], [393.0, 16.406022548879697], [394.0, 14.083699886892084], [395.0, 15.740670461733105], [401.0, 14.135289535185638], [400.0, 17.37483655382826], [402.0, 14.705163204747787], [403.0, 15.22360844529749], [404.0, 14.27641699207196], [405.0, 15.049844236760153], [406.0, 16.656792213288174], [407.0, 15.193145990404389], [408.0, 16.330842724154746], [414.0, 14.603879931839002], [415.0, 16.356650127072516], [412.0, 16.349442860844793], [413.0, 17.60039564787333], [409.0, 17.284804753820023], [410.0, 14.00585284280935], [411.0, 16.796108392025683], [417.0, 15.37863354037269], [416.0, 19.40934517933531], [418.0, 19.039911308203905], [419.0, 15.824011103400455], [420.0, 17.608018684312903], [421.0, 16.93628374136846], [422.0, 16.953637660485022], [423.0, 17.809222298692386], [424.0, 17.500550357732518], [430.0, 17.875211199613876], [431.0, 17.33871188294819], [428.0, 15.198384530657167], [429.0, 12.57518866188105], [425.0, 14.696532164496622], [426.0, 18.39943977591033], [427.0, 16.596805287799466], [433.0, 16.52002852727928], [432.0, 16.64895663756094], [434.0, 18.635439262472804], [435.0, 16.62793098363078], [436.0, 16.857925493060726], [437.0, 16.586541965261755], [438.0, 18.203876725700667], [439.0, 16.23624874335777], [440.0, 19.45272206303729], [446.0, 17.54579764842504], [447.0, 18.72915082382769], [444.0, 16.28516859852475], [445.0, 19.643442622950854], [441.0, 17.10408745247147], [442.0, 18.867598784194534], [443.0, 20.377899877899864], [449.0, 15.880105750165242], [448.0, 19.075792507204564], [450.0, 17.442388059701518], [451.0, 19.691949152542332], [452.0, 16.4298780487804], [453.0, 17.886891296582856], [454.0, 16.99234358176812], [455.0, 19.463136920011404], [456.0, 15.658206188506977], [462.0, 19.74897347686163], [463.0, 17.563673662616342], [460.0, 17.530252100840265], [461.0, 16.82990839316664], [457.0, 17.545519713261616], [458.0, 17.12610355523736], [459.0, 20.087454596255913], [465.0, 18.504548719176487], [464.0, 16.29931682322803], [466.0, 19.3072930529677], [467.0, 19.412198858097728], [468.0, 15.781957823483518], [469.0, 17.865999046256462], [470.0, 21.21524985640445], [471.0, 16.75528269560246], [472.0, 18.13605360775397], [478.0, 19.506612007405437], [479.0, 20.164957144864402], [476.0, 16.199043316502777], [477.0, 18.815792617369485], [473.0, 17.889007724301827], [474.0, 19.572292394517472], [475.0, 19.159130786880883], [481.0, 18.421491541577414], [480.0, 16.47067257559959], [482.0, 19.49973024008624], [483.0, 19.258660155653974], [484.0, 18.285014340344134], [485.0, 21.177178820632022], [486.0, 19.916078218359527], [487.0, 16.495831162063507], [488.0, 18.959904534606185], [494.0, 17.49007510729613], [495.0, 20.233310313075478], [492.0, 21.555370061213143], [493.0, 19.774390243902452], [489.0, 19.338668043366066], [490.0, 20.936801881246296], [491.0, 16.393333333333263], [497.0, 17.152722443559103], [496.0, 21.46600358715144], [498.0, 18.38957786787499], [499.0, 20.73956960913483], [500.0, 17.602369599768867], [501.0, 22.55291005291005], [502.0, 16.109380934295455], [503.0, 18.625238549618256], [504.0, 18.79978484341386], [510.0, 21.211140760507043], [511.0, 17.694130317716755], [508.0, 19.423671903105856], [509.0, 21.496131853346782], [505.0, 20.095525842118718], [506.0, 20.64425578529374], [507.0, 17.414189837008696], [515.0, 25.189995410738874], [512.0, 21.065415111940293], [526.0, 20.113214328501236], [527.0, 19.81769696969691], [524.0, 21.412089646464665], [525.0, 18.7034548944338], [522.0, 18.688462542417206], [523.0, 21.4407947628346], [513.0, 23.515435590754713], [514.0, 19.042482795129676], [516.0, 21.250031098395404], [517.0, 19.809131628377468], [518.0, 21.429976580796254], [519.0, 19.948312993539204], [528.0, 21.24790710234943], [542.0, 20.346986301369842], [543.0, 23.003671797768657], [540.0, 18.20333639826606], [541.0, 22.861328125000053], [538.0, 22.25803594026839], [539.0, 23.31575846833575], [536.0, 18.617290984190298], [537.0, 20.9109597227202], [529.0, 19.276198934280547], [530.0, 21.233178114086158], [531.0, 20.287829394186424], [532.0, 19.20449153882658], [533.0, 20.870188859670094], [534.0, 21.97250770811919], [535.0, 21.15769993390609], [520.0, 20.36821055347691], [521.0, 22.32283577796952], [547.0, 21.138355809128722], [544.0, 19.47579057866417], [558.0, 20.930452477854974], [559.0, 25.417783361250645], [556.0, 26.319442292796264], [557.0, 19.02840456596758], [554.0, 21.598124010232667], [555.0, 21.00527072352649], [545.0, 21.810881150080636], [546.0, 22.46016237787261], [548.0, 18.509298061812462], [549.0, 21.558139534883782], [550.0, 23.717977371141167], [551.0, 21.90735533520795], [560.0, 22.12518175809657], [574.0, 23.33509745708016], [575.0, 22.607497596924002], [572.0, 21.519062453641926], [573.0, 22.60563549160672], [570.0, 22.476781664080185], [571.0, 24.97490589711425], [568.0, 22.033975527206444], [569.0, 20.171169896732156], [561.0, 19.419870524507882], [562.0, 22.626986037554207], [563.0, 22.49450402144772], [564.0, 22.448752711496706], [565.0, 20.125845378596896], [566.0, 21.835951552944], [567.0, 23.24009508716342], [552.0, 22.904280843540853], [553.0, 22.810539928871655], [579.0, 21.202432545785012], [576.0, 21.988011029852633], [590.0, 21.976094105742405], [591.0, 25.245242562315713], [588.0, 22.45296430731999], [589.0, 22.496927374301688], [586.0, 22.268286063237916], [587.0, 23.869541060117747], [577.0, 24.636010865347338], [578.0, 23.583626999186656], [580.0, 24.18443508931614], [581.0, 22.21647197989059], [582.0, 21.377705306848586], [583.0, 23.021736534097663], [592.0, 23.14973594283932], [606.0, 22.16490638502162], [607.0, 22.928802201747015], [604.0, 22.058586105675072], [605.0, 21.191381495564006], [602.0, 22.428844839371145], [603.0, 23.596151345728718], [600.0, 21.484754119631486], [601.0, 24.81956521739134], [593.0, 23.15360576923084], [594.0, 23.94071644803235], [595.0, 23.28402677516748], [596.0, 22.023960952521723], [597.0, 23.07692307692306], [598.0, 24.05687746532641], [599.0, 26.151628884551872], [584.0, 24.784342491330964], [585.0, 23.55207910063658], [611.0, 23.481933778169438], [608.0, 22.0280530022682], [622.0, 22.645696969697024], [623.0, 23.441116568827105], [620.0, 25.727399165507602], [621.0, 21.41684665226778], [618.0, 24.944857348357676], [619.0, 24.504316454065215], [609.0, 25.927908825867963], [610.0, 24.130824636189853], [612.0, 25.187835889369474], [613.0, 24.126912928759943], [614.0, 21.460650128314736], [615.0, 24.042922046867556], [624.0, 26.19501894964809], [638.0, 22.116779089376067], [639.0, 24.952901189609207], [636.0, 26.132432731701826], [637.0, 25.273438773846415], [634.0, 22.247822878228725], [635.0, 25.04271356783913], [632.0, 25.56474911302579], [633.0, 25.10290798034791], [625.0, 22.34411121524523], [626.0, 23.899592329759916], [627.0, 23.996633806203455], [628.0, 25.911857557772468], [629.0, 25.536027397260177], [630.0, 22.405129658495092], [631.0, 24.748356246264134], [616.0, 24.82799850541781], [617.0, 26.475287745429874], [643.0, 25.631619836850984], [640.0, 26.72915201800032], [654.0, 27.833127147766362], [655.0, 26.575094543490014], [652.0, 24.663221153846163], [653.0, 25.319928613920293], [650.0, 29.170658231661452], [651.0, 21.86003280481131], [641.0, 22.132868149440295], [642.0, 26.58360340895456], [644.0, 25.25336560278318], [645.0, 24.196033851206256], [646.0, 27.94171220400727], [647.0, 25.304143735836753], [656.0, 22.87038271769563], [670.0, 25.360833450654663], [671.0, 26.356827638381056], [668.0, 28.194295465626567], [669.0, 27.315775109170247], [666.0, 30.571408705326093], [667.0, 25.251164888020472], [664.0, 24.656958920907428], [665.0, 25.89926937357766], [657.0, 26.644517066085637], [658.0, 30.115725190839722], [659.0, 23.62314540059352], [660.0, 29.08707300736768], [661.0, 25.501094434021237], [662.0, 25.86268406560515], [663.0, 29.281793478261015], [648.0, 25.881351869606867], [649.0, 25.145281656234967], [675.0, 29.629025512337847], [672.0, 28.43931416227899], [686.0, 26.56999877944589], [687.0, 28.421737466513612], [684.0, 27.576847096009487], [685.0, 26.09507481296765], [682.0, 32.56243425995498], [683.0, 27.64790286975719], [673.0, 25.205215244561007], [674.0, 27.556286637157594], [676.0, 25.284558933652825], [677.0, 28.333493975903643], [678.0, 28.64095205941937], [679.0, 31.436746987951803], [688.0, 28.55890944498531], [702.0, 25.75629345480695], [703.0, 26.433609211946706], [700.0, 28.445426124779086], [701.0, 24.81834836527623], [698.0, 26.516660651990883], [699.0, 29.605457131772994], [696.0, 29.97839100598633], [697.0, 24.55760305760304], [689.0, 25.912109374999986], [690.0, 27.289272030651258], [691.0, 31.43968754694302], [692.0, 24.008753647353103], [693.0, 26.211746336776432], [694.0, 26.691280817799043], [695.0, 26.768666002986603], [680.0, 26.627109417528597], [681.0, 25.73696423696432], [707.0, 24.824696021721138], [704.0, 26.22987402519489], [718.0, 29.253470051269193], [719.0, 29.188095886679356], [716.0, 31.48350694444444], [717.0, 28.559910134797807], [714.0, 28.282699916077206], [715.0, 27.28121927236968], [705.0, 26.128071216617304], [706.0, 26.061906523615637], [708.0, 29.80667497576507], [709.0, 28.113372093023315], [710.0, 28.758709981167627], [711.0, 28.532253637112245], [720.0, 27.08759733036697], [734.0, 28.375817785316148], [735.0, 28.11208169291342], [732.0, 27.396874087058112], [733.0, 27.97560975609758], [730.0, 30.174306603226167], [731.0, 29.85843417407785], [728.0, 25.921938276776963], [729.0, 27.52234359483606], [721.0, 27.25241219606339], [722.0, 31.58943044298878], [723.0, 29.10217391304347], [724.0, 25.547526478080158], [725.0, 27.930641445374064], [726.0, 29.12810218978111], [727.0, 31.68540966846797], [712.0, 27.836758661186096], [713.0, 26.46563596206315], [739.0, 30.460972680876658], [736.0, 32.768281780797366], [750.0, 27.88258435466789], [751.0, 32.465168013113434], [748.0, 31.263775676556836], [749.0, 28.86007432541604], [746.0, 32.695196369895115], [747.0, 29.17033752860409], [737.0, 29.931231049120694], [738.0, 30.42315789473688], [740.0, 29.271277931207635], [741.0, 26.753105293330787], [742.0, 33.40050943961644], [743.0, 26.322366563117775], [752.0, 31.59338662790695], [766.0, 30.618678925719788], [767.0, 30.518206556952247], [764.0, 31.572022160664808], [765.0, 28.951666909302727], [762.0, 29.1722080136402], [763.0, 30.421910538286557], [760.0, 29.30907988479622], [761.0, 30.068891956330813], [753.0, 30.53490127028051], [754.0, 30.91572313608198], [755.0, 28.811537200917783], [756.0, 30.2642287234043], [757.0, 25.720022078101376], [758.0, 29.739188370684488], [759.0, 32.77900255410676], [744.0, 28.761090909090907], [745.0, 29.76696885169692], [771.0, 31.4618637668025], [768.0, 31.380311507636403], [782.0, 32.17911479944687], [783.0, 29.227636849132256], [780.0, 30.01692913385817], [781.0, 29.119955156950688], [778.0, 30.76583302227192], [779.0, 31.03518942968859], [769.0, 30.094537815126], [770.0, 32.26071244192038], [772.0, 29.20052527905457], [773.0, 29.863378067948176], [774.0, 33.194874532835016], [775.0, 30.78356045230502], [784.0, 33.83587405613334], [798.0, 27.55376059322038], [799.0, 30.317144244778966], [796.0, 33.28190883190886], [797.0, 31.42574127525581], [794.0, 30.866020593579627], [795.0, 30.767285411735305], [792.0, 35.34751102709514], [793.0, 30.146183874007196], [785.0, 27.005693950177964], [786.0, 31.760958028136383], [787.0, 32.48434125269965], [788.0, 33.51978594564144], [789.0, 28.488018043416986], [790.0, 30.074594332768108], [791.0, 31.195405108150947], [776.0, 28.707793923381757], [777.0, 30.611198642588743], [803.0, 29.853889023503903], [800.0, 35.47144253595867], [814.0, 29.475026014568265], [815.0, 30.883681398737423], [812.0, 34.359426229508216], [813.0, 31.6281335052286], [810.0, 29.77412731006161], [811.0, 33.20192190731063], [801.0, 30.176551303552287], [802.0, 32.08949226835496], [804.0, 30.31656539495953], [805.0, 28.22951987462597], [806.0, 29.425310642895784], [807.0, 30.459223179717693], [816.0, 34.82981733985058], [830.0, 34.13040935672502], [831.0, 35.59466019417483], [828.0, 33.55834901855324], [829.0, 30.04437664678967], [826.0, 34.2059187577358], [827.0, 31.559558396281354], [824.0, 28.457863585118282], [825.0, 32.673471928295925], [817.0, 34.28755122226934], [818.0, 28.488870104254726], [819.0, 35.22692019014264], [820.0, 33.29382984506661], [821.0, 30.211156586327125], [822.0, 35.66434509099094], [823.0, 36.00666233344175], [808.0, 31.601943005181393], [809.0, 30.316748335217984], [835.0, 35.79980107985212], [832.0, 29.809914841849185], [846.0, 35.45372358458574], [847.0, 36.84912170639885], [844.0, 36.61898335582545], [845.0, 30.305308464849226], [842.0, 29.565248842592624], [843.0, 35.19850458273038], [833.0, 34.86588636917836], [834.0, 32.67788876556894], [836.0, 30.942299221847], [837.0, 35.26358961802147], [838.0, 36.5900984009841], [839.0, 30.964951014212755], [848.0, 29.33261494252879], [862.0, 33.99574623237742], [863.0, 38.481336502167125], [860.0, 38.47649226234329], [861.0, 31.835788561525078], [858.0, 32.22584951456319], [859.0, 33.626658551430346], [856.0, 29.401816430439016], [857.0, 32.55123674911672], [849.0, 31.641596796395994], [850.0, 36.33453521126764], [851.0, 35.98537720172816], [852.0, 29.80048419253779], [853.0, 34.50692419825081], [854.0, 36.37000539956802], [855.0, 34.89842141386411], [840.0, 32.84537327856971], [841.0, 38.37496318114883], [867.0, 39.6380501015574], [864.0, 32.70444971037387], [878.0, 31.679076086956464], [879.0, 32.81104117492782], [876.0, 36.86740813433635], [877.0, 36.57318900915908], [874.0, 34.8547724940129], [875.0, 32.89998550514578], [865.0, 30.786579423639118], [866.0, 33.25832012678275], [868.0, 32.510052239987125], [869.0, 36.258270321360904], [870.0, 33.918708986205665], [871.0, 35.680198466396135], [880.0, 34.32190615122784], [894.0, 34.24684804246843], [895.0, 31.079453924914535], [892.0, 37.42014833127309], [893.0, 37.031323631323595], [890.0, 38.862396408839736], [891.0, 34.08295625942702], [888.0, 33.48646023072243], [889.0, 34.20814479637993], [881.0, 35.776901901901816], [882.0, 36.954538873606396], [883.0, 33.02560091025468], [884.0, 35.45924892454378], [885.0, 36.35754985754996], [886.0, 34.7096774193549], [887.0, 33.357243319268484], [872.0, 33.420754219409204], [873.0, 38.731180449487226], [899.0, 32.599614085866], [896.0, 34.9257498171179], [910.0, 35.3675939937144], [911.0, 34.25100479709571], [908.0, 33.65834394904467], [909.0, 35.30759878419451], [906.0, 33.28606178545371], [907.0, 32.93023255813951], [897.0, 33.52105517909017], [898.0, 36.61211736044903], [900.0, 34.4178669687652], [901.0, 35.767289492841506], [902.0, 37.84363111635833], [903.0, 35.37679101587709], [912.0, 37.585787136042185], [926.0, 37.789665900176026], [927.0, 33.06266666666657], [924.0, 36.0217934976779], [925.0, 36.95253921829303], [922.0, 32.01920596244812], [923.0, 35.644032670974], [920.0, 40.367519415258165], [921.0, 36.976041164174354], [913.0, 34.77849909114523], [914.0, 36.06703096539165], [915.0, 39.87890457851948], [916.0, 32.6223697217907], [917.0, 36.00522426095833], [918.0, 45.193014426727466], [919.0, 33.78], [904.0, 32.58627808136], [905.0, 33.33883076923077], [931.0, 34.057219892151046], [928.0, 36.0263567748892], [942.0, 38.570598397989755], [943.0, 41.190100882723584], [940.0, 39.653223994608055], [941.0, 38.41818455517088], [938.0, 38.2383292383293], [939.0, 35.862918215613384], [929.0, 37.26009248843882], [930.0, 39.07338551859108], [932.0, 36.34522791152381], [933.0, 36.313077469793946], [934.0, 35.919092578022585], [935.0, 38.740118744699124], [944.0, 36.75649183147023], [958.0, 37.58056640625013], [959.0, 39.72089454067086], [956.0, 39.75273280752736], [957.0, 34.10176668126716], [954.0, 37.142398049645394], [955.0, 35.027283008198964], [952.0, 35.27752686497432], [953.0, 40.01172590692564], [945.0, 34.06491522834862], [946.0, 38.710853658536756], [947.0, 39.2343579681709], [948.0, 37.47017091260882], [949.0, 35.48853484216793], [950.0, 39.14723630219652], [951.0, 39.831304596878276], [936.0, 37.62896534895085], [937.0, 38.09327387588279], [963.0, 36.581454545454555], [960.0, 36.80707298720846], [974.0, 37.182625994695], [975.0, 38.336098572648545], [972.0, 40.26679104477625], [973.0, 35.66934034020176], [970.0, 37.20288975230665], [971.0, 40.04360596475367], [961.0, 37.74016754224076], [962.0, 36.1164862272165], [964.0, 39.491737334203044], [965.0, 41.65786140763535], [966.0, 36.59918344361531], [967.0, 37.62512195121956], [976.0, 39.38160842293894], [990.0, 39.9775172413793], [991.0, 35.46345403149802], [988.0, 39.26647000983271], [989.0, 39.86173924279623], [986.0, 35.908574756150784], [987.0, 36.911896949811506], [984.0, 39.895006057342854], [985.0, 38.61125688795597], [977.0, 37.26985362815324], [978.0, 36.82074322266219], [979.0, 37.4975130413683], [980.0, 38.23106619734307], [981.0, 42.82563025210092], [982.0, 38.25474221789872], [983.0, 39.77657107992688], [968.0, 42.19151108518084], [969.0, 33.46966817716695], [995.0, 38.12532056761842], [992.0, 39.788384426335604], [993.0, 37.38446507083534], [994.0, 40.940091685767754], [996.0, 38.04603421461888], [997.0, 38.27208652327119], [998.0, 39.816632665306805], [999.0, 39.08361774744026], [1000.0, 36.91362752933763], [1.0, 1.7090909090909092]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[765.2347549336791, 28.855221025929502]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1000.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 1857900.8, "minX": 1.53079458E12, "maxY": 2.6281459733333334E7, "series": [{"data": [[1.53079518E12, 1.1575566666666666E7], [1.53079488E12, 2.4229533516666666E7], [1.53079458E12, 1.0963917866666667E7], [1.53079506E12, 2.61531964E7], [1.53079476E12, 2.4116798316666666E7], [1.53079494E12, 2.50570468E7], [1.53079464E12, 2.4302476E7], [1.53079512E12, 2.6281459733333334E7], [1.53079482E12, 2.3967267416666668E7], [1.530795E12, 2.5585937866666667E7], [1.5307947E12, 2.3993767666666668E7]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.53079518E12, 1961549.8666666667], [1.53079488E12, 4105872.15], [1.53079458E12, 1857900.8], [1.53079506E12, 4431817.833333333], [1.53079476E12, 4086816.216666667], [1.53079494E12, 4246068.75], [1.53079464E12, 4118198.783333333], [1.53079512E12, 4453552.7], [1.53079482E12, 4061452.783333333], [1.530795E12, 4335692.416666667], [1.5307947E12, 4065886.783333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53079518E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 2.676128304694581, "minX": 1.53079458E12, "maxY": 38.36713434787068, "series": [{"data": [[1.53079518E12, 36.34045423262287], [1.53079488E12, 38.36713434787068], [1.53079458E12, 2.676128304694581], [1.53079506E12, 36.265417499787304], [1.53079476E12, 24.092230832096746], [1.53079494E12, 37.82073014552775], [1.53079464E12, 8.255993732216332], [1.53079512E12, 35.91503542969149], [1.53079482E12, 32.06658764574666], [1.530795E12, 36.95457998819353], [1.5307947E12, 16.235318101979924]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53079518E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 2.674711384193354, "minX": 1.53079458E12, "maxY": 38.36462299449991, "series": [{"data": [[1.53079518E12, 36.33792429456385], [1.53079488E12, 38.36462299449991], [1.53079458E12, 2.674711384193354], [1.53079506E12, 36.26276186263716], [1.53079476E12, 24.090017619813192], [1.53079494E12, 37.81807724443838], [1.53079464E12, 8.254122575823311], [1.53079512E12, 35.91238123414771], [1.53079482E12, 32.06418909710641], [1.530795E12, 36.95218618368701], [1.5307947E12, 16.233616776845327]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53079518E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.0013486176668914187, "minX": 1.53079458E12, "maxY": 0.02839087432548861, "series": [{"data": [[1.53079518E12, 0.01695113558155589], [1.53079488E12, 0.01551528446880176], [1.53079458E12, 0.0013486176668914187], [1.53079506E12, 0.014822585892407647], [1.53079476E12, 0.010272608293798766], [1.53079494E12, 0.02839087432548861], [1.53079464E12, 0.00307554121920206], [1.53079512E12, 0.02831040871458843], [1.53079482E12, 0.01484799995745359], [1.530795E12, 0.01071918755122049], [1.5307947E12, 0.0068165895802135435]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53079518E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 0.0, "minX": 1.53079458E12, "maxY": 1080.0, "series": [{"data": [[1.53079518E12, 295.0], [1.53079488E12, 1080.0], [1.53079458E12, 247.0], [1.53079506E12, 1000.0], [1.53079476E12, 298.0], [1.53079494E12, 383.0], [1.53079464E12, 270.0], [1.53079512E12, 1028.0], [1.53079482E12, 1016.0], [1.530795E12, 315.0], [1.5307947E12, 275.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.53079518E12, 1.0], [1.53079488E12, 0.0], [1.53079458E12, 0.0], [1.53079506E12, 0.0], [1.53079476E12, 0.0], [1.53079494E12, 0.0], [1.53079464E12, 0.0], [1.53079512E12, 0.0], [1.53079482E12, 0.0], [1.530795E12, 0.0], [1.5307947E12, 0.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.53079518E12, 83.0], [1.53079488E12, 85.0], [1.53079458E12, 3.0], [1.53079506E12, 80.0], [1.53079476E12, 77.0], [1.53079494E12, 86.0], [1.53079464E12, 54.0], [1.53079512E12, 80.0], [1.53079482E12, 83.0], [1.530795E12, 80.0], [1.5307947E12, 71.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.53079518E12, 99.0], [1.53079488E12, 96.0], [1.53079458E12, 56.0], [1.53079506E12, 90.0], [1.53079476E12, 89.0], [1.53079494E12, 97.0], [1.53079464E12, 75.0], [1.53079512E12, 95.0], [1.53079482E12, 94.0], [1.530795E12, 92.0], [1.5307947E12, 96.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.53079518E12, 88.0], [1.53079488E12, 91.0], [1.53079458E12, 4.0], [1.53079506E12, 84.0], [1.53079476E12, 83.0], [1.53079494E12, 91.0], [1.53079464E12, 59.0], [1.53079512E12, 86.0], [1.53079482E12, 88.0], [1.530795E12, 86.0], [1.5307947E12, 80.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53079518E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 2.0, "minX": 11468.0, "maxY": 22.0, "series": [{"data": [[11468.0, 2.0], [12108.0, 22.0], [25421.0, 6.0], [25098.0, 11.0], [25227.0, 15.0], [25070.0, 21.0], [25344.0, 22.0], [26210.0, 21.0], [26763.0, 21.0], [27356.0, 21.0], [27491.0, 21.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[25227.0, 10.0], [25070.0, 12.0], [25344.0, 14.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 27491.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 2.0, "minX": 11468.0, "maxY": 22.0, "series": [{"data": [[11468.0, 2.0], [12108.0, 22.0], [25421.0, 6.0], [25098.0, 11.0], [25227.0, 15.0], [25070.0, 21.0], [25344.0, 22.0], [26210.0, 21.0], [26763.0, 21.0], [27356.0, 21.0], [27491.0, 21.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[25227.0, 10.0], [25070.0, 12.0], [25344.0, 14.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 27491.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 11468.533333333333, "minX": 1.53079458E12, "maxY": 27491.066666666666, "series": [{"data": [[1.53079518E12, 12108.333333333334], [1.53079488E12, 25344.9], [1.53079458E12, 11468.533333333333], [1.53079506E12, 27356.9], [1.53079476E12, 25227.283333333333], [1.53079494E12, 26210.3], [1.53079464E12, 25421.0], [1.53079512E12, 27491.066666666666], [1.53079482E12, 25070.716666666667], [1.530795E12, 26763.533333333333], [1.5307947E12, 25098.083333333332]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53079518E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.21666666666666667, "minX": 1.53079458E12, "maxY": 27491.066666666666, "series": [{"data": [[1.53079518E12, 12108.333333333334], [1.53079488E12, 25344.683333333334], [1.53079458E12, 11468.533333333333], [1.53079506E12, 27356.9], [1.53079476E12, 25226.733333333334], [1.53079494E12, 26210.3], [1.53079464E12, 25421.0], [1.53079512E12, 27491.066666666666], [1.53079482E12, 25070.333333333332], [1.530795E12, 26763.533333333333], [1.5307947E12, 25098.083333333332]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.53079488E12, 0.21666666666666667], [1.53079476E12, 0.55], [1.53079482E12, 0.38333333333333336]], "isOverall": false, "label": "504", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53079518E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.21666666666666667, "minX": 1.53079458E12, "maxY": 27491.066666666666, "series": [{"data": [[1.53079518E12, 12108.333333333334], [1.53079488E12, 25344.683333333334], [1.53079458E12, 11468.533333333333], [1.53079506E12, 27356.9], [1.53079476E12, 25226.733333333334], [1.53079494E12, 26210.3], [1.53079464E12, 25421.0], [1.53079512E12, 27491.066666666666], [1.53079482E12, 25070.333333333332], [1.530795E12, 26763.533333333333], [1.5307947E12, 25098.083333333332]], "isOverall": false, "label": "HTTP Request-success", "isController": false}, {"data": [[1.53079488E12, 0.21666666666666667], [1.53079476E12, 0.55], [1.53079482E12, 0.38333333333333336]], "isOverall": false, "label": "HTTP Request-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53079518E12, "title": "Transactions Per Second"}},
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
