/* global Module */

/* Magic Mirror
 * Module: MMM-NOAATides
 *
 * By Corey Rice - Gracious help from Sam Detweiler & Karsten13 (on MM Discord)
 * MIT Licensed.
 */

Module.register('MMM-NOAATides', {
    // define variables used by module, but not in config data
    // treating these like 'private' variables (background in C++)
    APIparams: { //URLs that are built synchonously and then passed to node_helper
        predicted: "",
        measured: ""
    },
    NOAA: { //the data that the chart is built from -- starts empty
        station_name: "", //use the station ID number temporarily
        units: "", //the default value is set below to decide english/metric read-ably
        measured_times: [], //an empty array to be filled in steps below
        measured_tides: [], //an empty array to be filled in steps below
        predicted_times: [], //an empty array to be filled in steps below
        predicted_tides: [], //an empty array to be filled in steps below
        chart: { //these are needed for building a chart.js thing, with the MM getDom() 
            context: "", //info about the DOM elements
            content: "" //actual graph content, put in the DOM on second pass
        }
    },

    // holder for config info from module_name.js
    config: null,

    // anything here in defaults will be added to the config data
    // and replaced if the same thing is provided in config
    defaults: {
        // treating these as 'public' variables (background in C++)
        //==== NOAA Station and Settings ================
        stationID: String(8465705), //this happens to be the station at New Haven, CT
        datum: "MSL", // the selected is "mean sea level" https://tidesandcurrents.noaa.gov/datum_options.html
        time: "lst_ldt", //local standard time/ daylight time
        units: "english", //or "metric"

        updateInterval: 2500, //this is the delay for API calls
        animationSpeed: 1000 * 60 * 6, // will be every 6 minutes, to coincide with how often NOAA updates their data
        initialLoadDelay: 2500, // millisecond delay, so the node_helper has some time at start-up
        retryDelay: 2500, //to not overwhelm the API service

        apiBase: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date="
    },

    // init: function() {
    //     Log.log(this.name + " is in init!");
    // },

    start: function() {
        Log.log(this.name + " is starting!");

        if (this.config.units === "metric") {
            this.NOAA.units = "metric";
        } else { //MM uses 'imperial' but NOAA uses 'english', but they share 'metric' keyword
            this.NOAA.units = "english"; //default to this, because this is 'merica...
        }

        this.getNewTides();

        this.scheduleUpdate(this.config.initialLoadDelay); //let the first data request have 2.5 seconds to populate the data from node_helper

        // then run repeated updates every 6 minutes (since that is how fast NOAA posts data)
        var self = this; //needed for the lines below
        setInterval(function() {
            self.getNewTides();
        }, this.config.animationSpeed); //redraw this often...
    },

    getNewTides: function() {
        var self = this; //needed for the lines below

        //==== NOAA date format ====================
        const today = new Date(); //create a Date() object for today
        let year = String(today.getFullYear()); //turn the year into a string
        let month = today.getMonth() + 1; //js months are zero-referenced, NOAAs aren't --> so +1 to the month
        if (month < 10) month = "0" + String(month); //prepend a zero if less than 10, then make it a string
        let date = today.getDate(); //the date is one-referenced, so no funny business here
        if (date < 10) date = "0" + String(date); //prepend a zero if less than 10, then make it a string
        const NOAA_today = year + month + date; //concatenate for a proper NOAA date string

        //Update the URLs for the parameters at hand...
        this.APIparams.predicted = this.config.apiBase + NOAA_today + "&end_date=" + NOAA_today + "&station=" + this.config.stationID + "&product=" + "predictions" + "&datum=" + this.config.datum + "&time_zone=" + this.config.time + "&units=" + this.NOAA.units + "&format=json";
        this.APIparams.measured = this.config.apiBase + NOAA_today + "&end_date=" + NOAA_today + "&station=" + this.config.stationID + "&product=" + "water_level" + "&datum=" + this.config.datum + "&time_zone=" + this.config.time + "&units=" + this.NOAA.units + "&format=json";

        var request_params = JSON.stringify(self.APIparams);
        self.sendSocketNotification('START', request_params);

        self.updateDom(); //this is a function baked-into MM, that calls 'getDOM()'
    },

    // return list of other functional scripts to use, if any (like require in node_helper)
    getScripts: function() {
        return [
            // sample of list of files to specify here, if no files,do not use this routine, or return empty list
            "modules/" + this.name + "/node_modules/chart.js/dist/Chart.min.js",
            //'script.js', // will try to load it from the vendor folder, otherwise it will load is from the module folder.
            //'moment.js', // this file is available in the vendor folder, so it doesn't need to be available in the module folder.
            //this.file('anotherfile.js'), // this file will be loaded straight from the module folder.
            //'https://code.jquery.com/jquery-2.2.3.min.js',  // this file will be loaded from the jquery servers.
        ]
    },
    getStyles: function() {
        return ["MMM-NOAATides.css"];
    },

    // // return list of translation files to use, if any
    // getTranslations: function() {
    // 	return {
    // 		// sample of list of files to specify here, if no files, do not use this routine, , or return empty list
    // 		// en: "translations/en.json",  (folders and filenames in your module folder)
    // 		// de: "translations/de.json"
    // 	}
    // },  

    // only called if the module header was configured in module config in config.js
    // getHeader: function() {
    //     return this.NOAA.station_name + " Tides";
    // },


    // this is the major worker of the module, it provides the displayable content for this module
    getDom: function() {
        var wrapper = document.createElement("div");

        var chartWrapper = document.createElement("div");
        chartWrapper.className = "MMM-NOAATides vertical-screen large";
        wrapper.appendChild(chartWrapper);

        var chart = document.createElement("canvas");
        chart.id = "NOAATideChart";
        this.NOAA.chart.context = chart.getContext('2d');

        if (this.NOAA.predicted_times !== []) {
            this.drawChart();
        } else {
            chart.innerHTML = "Loading";
        }

        wrapper.appendChild(chart);

        // pass the created content back to MM to add to DOM.
        return wrapper;
    },

    /* scheduleUpdate()
     * Schedule next update. << This is for when 
     *
     * argument delay number - Milliseconds before next update. If empty, this.config.updateInterval is used.
     */
    scheduleUpdate: function(delay) {
        var nextLoad = this.config.updateInterval;
        if (typeof delay !== "undefined" && delay >= 0) {
            nextLoad = delay;
        }

        var self = this;
        setTimeout(function() { //one time, some delay in the future
            self.getNewTides();
        }, nextLoad);
    },
    /* socketNotificationReceived()
     * What to do when the node_helper sends a message.
     *
     * These args & kwargs are how sockets work -- the 'payload' is a JSON string with all the info...
     */
    socketNotificationReceived: function(notification, payload) {
        if (notification == "NOAA_TIDES_RESULT") {
            var helper_NOAA = JSON.parse(payload);
            Log.log(this.name + " module received notification from node_helper about: " + helper_NOAA.station_name);
            this.NOAA.station_name = helper_NOAA.station_name;
            this.NOAA.measured_times = helper_NOAA.measured_times;
            this.NOAA.measured_tides = helper_NOAA.measured_tides;
            this.NOAA.predicted_times = helper_NOAA.predicted_times;
            this.NOAA.predicted_tides = helper_NOAA.predicted_tides;

            this.updateDom();
        }
    },
    /*   /\    /\    /\    /\    /\    /\    /\    /\    /\    /\    /\    /\    /\    /\    /\    /\    /\    /\    /\
     *  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \
     * /    \/    \/    \/    \/    \/    \/    \/    \/    \/    \/    \/    \/    \/    \/    \/    \/    \/    \/    \
     */ //==== Draw the graph using the 'chart.js' library to do the heavy lifting ======================================
    drawChart: function() {
        this.NOAA.chart.content = new Chart(this.NOAA.chart.context, { //this is all really from https://www.chartjs.org/docs/master/
            type: 'line', // make the whole thing a line chart
            data: {
                labels: this.NOAA.predicted_times, //the X-axis is where the time-of-day goes
                //the predicted_times are used, because they're always the full 24 hours (don't have times for measured values before they happen)
                datasets: [{
                    label: this.NOAA.station_name, //just an empty part of the chart
                    data: ""
                }, {
                    label: 'Measured', //label in the legend, at the top
                    data: this.NOAA.measured_tides, //Y-axis data source for this one
                    "fill": '+1', //color the area between this and the next data ('filler' below in options)
                    "backgroundColor": "rgba(31, 133, 224, 0.25)", //color the area-under a subtle blue
                    "borderColor": "rgb(31, 133, 224, 0.75)", //color the line blue-ish
                    "pointBorderColor": "rgba(0,0,0,0)", //hide the points --> alpha = 0 
                    "pointBackgroundColor": "rgba(0,0,0,0)" //hide 'fill' of the points --> alpha = 0 
                }, {
                    label: 'Predicted', //label in the legend, at the top
                    data: this.NOAA.predicted_tides, //Y-Axis data source for this one
                    "fill": false, //don't color the area under the curve 
                    "borderColor": "gray", //color the line orange-ish
                    "pointBorderColor": "rgba(0,0,0,0)", //hide the points --> alpha = 0 
                    "pointBackgroundColor": "rgba(0,0,0,0)" //hide 'fill' of the points --> alpha = 0 
                }]
            },
            options: { //set the options for the chart (this is how chart.js like to do it -- config file style)
                aspectRatio: 1.618, //golden ratio, because we're fancy! (chande this to change the squareness)
                // the chart width decides the sizes, and has to be set in the getDom() or CSS file only absolute sizes work: https://www.chartjs.org/docs/3.0.2/configuration/responsive.html
                scales: { //the options for X & Y scales
                    yAxes: [{ //set-up the formatting for the Y-axis
                        ticks: { //specifically, the labels
                            beginAtZero: true,
                            //take what would have been the labels, and modify them
                            callback: function(value, index, values) {
                                let chartUnits = ' ft'; //filler label
                                //change things if the user wants metric
                                //if (this.NOAA.units === "metric") chartUnits = " m";

                                return (value + chartUnits); //return a nicely formatted label for each tick-mark
                            }
                        },
                    }],
                    xAxes: [{ //set-up the formatting for the Y-axis
                        ticks: { //specifically, the labels
                            //take what would have been the labels, and modify them
                            callback: function(value, index, values) {
                                //the 'incoming' data for these ticks are date strings
                                const t = new Date(value); //turn them into Date() objects
                                let hours = t.getHours(); //get the 'hours' of the new Date() object
                                if (hours < 10) hours = '0' + String(hours); //prepend with a zero, if less than 10
                                let minutes = t.getMinutes(); //get the 'minutes' of the new Date() object
                                if (minutes < 10) minutes = '0' + String(minutes); //prepend with a zero, if less than 10
                                const pretty_time = hours + ":" + minutes; //combine these into a 'pretty' time value
                                return pretty_time; //this is what the tick-marks should really be...
                            }
                        },
                    }]
                },
                animation: { //the options for animations
                    duration: 0 //the default here is 400ms
                        //the animation has to be zero, since the interval timer would invoke an animation
                        //setting to zero make the graph look static, new data just 'pops' into exsistence
                },
                plugins: { //apparently this isn't part of standard settings
                    filler: { //these are how you fine-tune the 'fill' option
                        propogate: true //allow filling in the area between the 2 curves
                    }
                }
            }
        });
    },
});