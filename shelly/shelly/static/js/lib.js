// common library functions, mostly for plotting but used elsewhere too
(function() {
    'use strict';
    // TODO: can use camelcase after fixing conf_modal and showSources
    /* jshint camelcase: false */

    // ---Plotly global modules
    /* global Plotly:false, Tabs:false */

    // ---global functions not yet namespaced
    /* global pullf:false */

    // ---external global dependencies
    /* global d3:false, Spinner:false */

    if(!window.Plotly) { window.Plotly = {}; }
    var lib = Plotly.Lib = {};

    // dateTime2ms - turn a date object or string s of the form
    // YYYY-mm-dd HH:MM:SS.sss into milliseconds (relative to 1970-01-01,
    // per javascript standard)
    // may truncate after any full field, and sss can be any length
    // even >3 digits, though javascript dates truncate to milliseconds
    // returns false if it doesn't find a date

    // 2-digit to 4-digit year conversion, where to cut off?
    // from http://support.microsoft.com/kb/244664:
    //   1930-2029 (the most retro of all...)
    // but in my mac chrome from eg. d=new Date(Date.parse('8/19/50')):
    //   1950-2049
    // by Java, from http://stackoverflow.com/questions/2024273/:
    //   now-80 - now+20
    // or FileMaker Pro, from
    //      http://www.filemaker.com/12help/html/add_view_data.4.21.html:
    //   now-70 - now+30
    // but python strptime etc, via
    //      http://docs.python.org/py3k/library/time.html:
    //   1969-2068 (super forward-looking, but static, not sliding!)

    // lets go with now-70 to now+30, and if anyone runs into this problem
    // they can learn the hard way not to use 2-digit years, as no choice we
    // make now will cover all possibilities. mostly this will all be taken
    // care of in initial parsing, should only be an issue for hand-entered data
    // currently (2012) this range is:
    //   1942-2041

    lib.dateTime2ms = function(s) {
        // first check if s is a date object
        try { if(s.getTime) { return +s; } }
        catch(e){ return false; }

        var y,m,d,h;
        // split date and time parts
        s=String(s).split(' ');
        if(s.length>2) { return false; }
        var p = s[0].split('-'); // date part
        if(p.length>3 || (p.length!==3 && s.length>1)) { return false; }
        // year
        if(p[0].length===4) { y = Number(p[0]); }
        else if(p[0].length===2) {
            var yNow=new Date().getFullYear();
            y=((Number(p[0])-yNow+70)%100+200)%100+yNow-70;
        }
        else { return false; }
        if(!$.isNumeric(y) || (y<0)) { return false; }
        if(p.length===1) { return new Date(y,0,1).getTime(); } // year only

        // month
        m = Number(p[1])-1; // new Date() uses zero-based months
        if(p[1].length>2 || !(m>=0 && m<=11)) { return false; }
        if(p.length===2) { return new Date(y,m,1).getTime(); } // year-month

        // day
        d = Number(p[2]);

        if(p[2].length>2 || !(d>=1 && d<=31)) { return false; }

        // now save the date part
        d = new Date(y,m,d).getTime();
        if(s.length===1) { return d; } // year-month-day

        p = s[1].split(':');
        if(p.length>3) { return false; }

        // hour
        h = Number(p[0]);
        if(p[0].length>2 || !(h>=0 && h<=23)) { return false; }
        d += 3600000*h;
        if(p.length===1) { return d; }

        // minute
        m = Number(p[1]);
        if(p[1].length>2 || !(m>=0 && m<=59)) { return false; }
        d += 60000*m;
        if(p.length===2) { return d; }

        // second
        s = Number(p[2]);
        if(!(s>=0 && s<60)) { return false; }
        return d+s*1000;
    };

    // is string s a date? (see above)
    lib.isDateTime = function(s){ return lib.dateTime2ms(s)!==false; };

    // Turn ms into string of the form YYYY-mm-dd HH:MM:SS.sss
    // Crop any trailing zeros in time, but always leave full date
    // (we could choose to crop '-01' from date too)...
    // Optional range r is the data range that applies, also in ms.
    // If rng is big, the later parts of time will be omitted
    lib.ms2DateTime = function(ms,r) {
        if(typeof(d3)==='undefined'){
            console.log('d3 is not defined');
            return;
        }

        if(!r) { r=0; }
        var d = new Date(ms),
            s = d3.time.format('%Y-%m-%d')(d);
        if(r<7776000000) {
            // <90 days: add hours
            s+=' '+lib.lpad(d.getHours(),2);
            if(r<432000000) {
                // <5 days: add minutes
                s+=':'+lib.lpad(d.getMinutes(),2);
                if(r<10800000) {
                    // <3 hours: add seconds
                    s+=':'+lib.lpad(d.getSeconds(),2);
                    if(r<300000) {
                        // <5 minutes: add ms
                        s+='.'+lib.lpad(d.getMilliseconds(),3);
                    }
                }
            }
            // strip trailing zeros
            return s.replace(/([:\s]00)*\.?[0]*$/,'');
        }
        return s;
    };

    // Plotly.Lib.parseDate: forgiving attempt to turn any date string
    // into a javascript date object

    // first collate all the date formats we want to support, precompiled
    // to d3 format objects see below for the string cleaning that happens
    // before this separate out 2-digit (y) and 4-digit-year (Y) formats,
    // formats with month names (b), and formats with am/pm (I) or no time (D)
    // (also includes hour only, as the test is really for a colon) so we can
    // cut down the number of tests we need to run for any given string
    // (right now all are between 15 and 32 tests)

    // TODO: this is way out of date vs. the server-side version
    var timeFormats = {
        // 24 hour
        H:['%H:%M:%S~%L', '%H:%M:%S', '%H:%M'],
        // with am/pm
        I:['%I:%M:%S~%L%p', '%I:%M:%S%p', '%I:%M%p'],
        // no colon, ie only date or date with hour
        // (could also support eg 12h34m?)
        D:['%H', '%I%p', '%Hh']
    };
    var dateFormats = {
        Y:[
            '%Y~%m~%d',
            '%Y%m%d',
            '%y%m%d', // YYMMDD, has 6 digits together so will match Y, not y
            '%m~%d~%Y', // MM/DD/YYYY has first precedence
            '%d~%m~%Y' // then DD/MM/YYYY
        ],
        Yb:[
            '%b~%d~%Y', // eg nov 21 2013
            '%d~%b~%Y', // eg 21 nov 2013
            '%Y~%d~%b', // eg 2013 21 nov (or 2013 q3, after replacement)
            '%Y~%b~%d' // eg 2013 nov 21
        ],
        // the two-digit year cases have so many potential ambiguities
        // it's not even funny, but we'll try them anyway.
        y:[
            '%m~%d~%y',
            '%d~%m~%y',
            '%y~%m~%d'
        ],
        yb:[
            '%b~%d~%y',
            '%d~%b~%y',
            '%y~%d~%b',
            '%y~%b~%d'
        ]
    };

    // use utc formatter since we're ignoring timezone info
    if(typeof d3 !=='undefined'){
        var formatter = d3.time.format.utc;

        // ISO8601 and YYYYMMDDHHMMSS are the only one where date and time
        // are not separated by a space, so they get inserted specially here.
        // Also a couple formats with no day (so time makes no sense)
        var dateTimeFormats = {
            Y:{
                H:['%Y~%m~%dT%H:%M:%S','%Y~%m~%dT%H:%M:%S~%L'].map(formatter),
                I:[],
                D:['%Y%m%d%H%M%S','%Y~%m','%m~%Y'].map(formatter)
            },
            Yb:{H:[],I:[],D:['%Y~%b','%b~%Y'].map(formatter)},
            y:{H:[],I:[],D:[]},
            yb:{H:[],I:[],D:[]}
        };
        // all the others get inserted in all possible combinations
        // from dateFormats and timeFormats
        ['Y','Yb','y','yb'].forEach(function(dateType) {
            dateFormats[dateType].forEach(function(dateFormat){
                // just a date (don't do just a time)
                dateTimeFormats[dateType].D.push(formatter(dateFormat));
                ['H','I','D'].forEach(function(timeType) {
                    timeFormats[timeType].forEach(function(timeFormat) {
                        var a = dateTimeFormats[dateType][timeType];
                        // 'date time', then 'time date'
                        a.push(formatter(dateFormat+'~'+timeFormat));
                        a.push(formatter(timeFormat+'~'+dateFormat));
                    });
                });
            });
        });
    }
    // precompiled regexps for performance
    var matchword = /[a-z]*/g,
        shortenword = function(m) { return m.substr(0,3); },
        weekdaymatch = /(mon|tue|wed|thu|fri|sat|sun|the|of|st|nd|rd|th)/g,
        separatormatch = /[\s,\/\-\.\(\)]+/g,
        ampmmatch = /~?([ap])~?m(~|$)/,
        replaceampm = function(m,ap) { return ap+'m '; },
        match4Y = /\d\d\d\d/,
        matchMonthName = /(^|~)[a-z]{3}/,
        matchAMPM = /[ap]m/,
        matchcolon = /:/,
        matchquarter = /q([1-4])/,
        quarters = ['31~mar','30~jun','30~sep','31~dec'],
        replacequarter = function(m,n) { return quarters[n-1]; },
        matchTZ = / ?([+\-]\d\d:?\d\d|Z)$/;

    lib.parseDate = function(v) {
        // is it already a date? just return it
        if(v.getTime) { return v; }
        // otherwise, if it's not a string, return nothing
        // the case of numbers that just have years will get
        // dealt with elsewhere.
        if(typeof v !== 'string') { return; }

        // first clean up the string a bit to reduce the number
        // of formats we have to test
        v = v.toLowerCase()
            // cut all words down to 3 characters - this will result in
            // some spurious matches, ie whenever the first three characters
            // of a word match a month or weekday but that seems more likely
            // to fix typos than to make dates where they shouldn't be...
            // and then we can omit the long form of months from our testing
            .replace(matchword,shortenword)
            // remove weekday names, as they get overridden anyway if they're
            // inconsistent also removes a few more words
            // (ie "tuesday the 26th of november")
            // TODO: language support?
            // for months too, but these seem to be built into d3
            .replace(weekdaymatch,'')
            // collapse all separators one ~ at a time, except : which seems
            // pretty consistent for the time part use ~ instead of space or
            // something since d3 can eat a space as padding on 1-digit numbers
            .replace(separatormatch,'~')
            // in case of a.m. or p.m. (also take off any space before am/pm)
            .replace(ampmmatch,replaceampm)
            // turn quarters Q1-4 into dates (quarter ends)
            .replace(matchquarter,replacequarter)
            .trim()
            // also try to ignore timezone info, at least for now
            .replace(matchTZ,'');

        // now test against the various formats that might match
        var dateType = (match4Y.test(v) ? 'Y' : 'y') +
                    (matchMonthName.test(v) ? 'b' : ''),
            timeType = matchcolon.test(v) ?
                    (matchAMPM.test(v) ? 'I' : 'H') : 'D',
            formatList = dateTimeFormats[dateType][timeType],
            len = formatList.length,
            out = null;
        for(var i = 0; i<len; i++) {
            out = formatList[i].parse(v);
            if(out) { break; }
        }
        return out;
    };

    // findBin - find the bin for val - note that it can return outside the
    // bin range any pos. or neg. integer for linear bins, or -1 or
    // bins.length-1 for explicit.
    // bins is either an object {start,size,end} or an array length #bins+1
    // bins can be either increasing or decreasing but must be monotonic
    // for linear bins, we can just calculate. For listed bins, run a binary
    // search linelow (truthy) says the bin boundary should be attributed to
    // the lower bin rather than the default upper bin
    lib.findBin = function(val,bins,linelow) {
        if($.isNumeric(bins.start)) {
            return linelow ?
                Math.ceil((val-bins.start)/bins.size)-1 :
                Math.floor((val-bins.start)/bins.size);
        }
        else {
            var n1 = 0,
                n2 = bins.length,
                c = 0,
                n,
                test;
            if(bins[bins.length-1]>bins[0]) {
                test = linelow ? function(a,b){return a<b;} :
                    function(a,b){return a<=b;};
            }
            else{
                test = linelow ? function(a,b){return a>=b;} :
                    function(a,b){return a>b;};
            }
            // c is just to avoid infinite loops if there's an error
            while(n1<n2 && c++<100){
                n=Math.floor((n1+n2)/2);
                if(test(bins[n],val)) { n1=n+1; }
                else { n2=n; }
            }
            if(c>90) { console.log('Long binary search...'); }
            return n1-1;
        }
    };

    // find distinct values in an array, lumping together ones that appear to
    // just be off by a rounding error
    // return the distinct values and the minimum difference between any two
    lib.distinctVals = function(valsIn) {
        var vals = valsIn.slice(); // otherwise we sort the original array...
        vals.sort(function(a,b){ return a-b; });
        var l = vals.length-1,
            minDiff = (vals[l]-vals[0])||1,
            errDiff = minDiff/(l||1)/10000,
            v2=[vals[0]];
        for(var i=0;i<l;i++) {
            // make sure values aren't just off by a rounding error
            if(vals[i+1]>vals[i]+errDiff) {
                minDiff=Math.min(minDiff,vals[i+1]-vals[i]);
                v2.push(vals[i+1]);
            }
        }
        return {vals:v2,minDiff:minDiff};
    };

    // return the smallest element from (sorted) array a that's bigger than val,
    // or (reverse) the largest element smaller than val
    // used to find the best tick given the minimum (non-rounded) tick
    // particularly useful for date/time where things are not powers of 10
    // binary search is probably overkill here...
    lib.roundUp = function(v,a,reverse){
        var l = 0,
            h = a.length-1,
            m,
            c = 0,
            dl = reverse ? 0 : 1,
            dh = reverse ? 1 : 0,
            r = reverse ? Math.ceil : Math.floor;
        // c is just to avoid infinite loops if there's an error
        while(l<h && c++<100){
            m = r((l+h)/2);
            if(a[m]<=v) { l = m+dl; }
            else { h = m-dh; }
        }
        return a[l];
    };

    // convert a string s (such as 'xaxis.range[0]')
    // representing a property of nested object o into set and get methods
    // also return the string and object so we don't have to keep track of them
    lib.nestedProperty = function(o,s) {
        var cont = o,
            aa = s.split('.'), i, j=0;
        // check for parts of the nesting hierarchy that are numbers
        // (ie array elements)
        while(j<aa.length) {
            // look for non-bracket chars, then any number of [##] blocks
            var indexed = String(aa[j]).match(/^([^\[\]]+)((\[\-?[0-9]*\])+)$/);
            if(indexed) {
                var indices = indexed[2]
                    .substr(1,indexed[2].length-2)
                    .split('][');
                aa.splice(j,1,indexed[1]);
                for(i=0; i<indices.length; i++) {
                    j++;
                    aa.splice(j,0,Number(indices[i]));
                }
            }
            j++;
        }

        // Special array index -1 gets and sets properties of an entire
        // array at once.
        // eg: "annotations[-1].showarrow" sets showarrow for all annotations
        // set() can take either a single value to apply to all or an array
        // to apply different to each entry. Get can also return either
        var suffix = s.substr(s.indexOf('[-1]')+4),
            npArray;
        if(suffix.charAt(0)==='.') {
            suffix = suffix.substr(1);
        }

        function subNP(entry) {
            return lib.nestedProperty(entry,suffix);
        }

        function subSet(v) {
            for(i=0; i<npArray.length; i++) {
                npArray[i].set($.isArray(v) ? v[i%v.length] : v);
            }
        }

        function subGet() {
            var allsame = true, out = [];
            for(i=0; i<npArray.length; i++) {
                out[i] = npArray[i].get();
                if(out[i]!==out[0]) { allsame = false; }
            }
            return allsame ? out[0] : out;
        }

        // dive in to the 2nd to last level
        for(j=0; j<aa.length-1; j++) {
            if(aa[j]===-1) {
                npArray = cont.map(subNP);
                return {
                    set: subSet,
                    get: subGet,
                    astr: s,
                    parts: aa,
                    obj: o
                };
            }
            // make the heirarchy if it doesn't exist
            if(!(aa[j] in cont)) {
                cont[aa[j]] = (typeof aa[j+1]==='string') ? {} : [];
            }
            cont = cont[aa[j]];
        }
        var prop = aa[j];

        return {
            set: function(v){
                    if(v===undefined || v===null) { delete cont[prop]; }
                    else { cont[prop]=v; }
                },
            get:function(){ return cont[prop]; },
            astr:s,
            parts:aa,
            obj:o
        };
    };

    // to prevent event bubbling, in particular text selection during drag.
    // see http://stackoverflow.com/questions/5429827/
    //      how-can-i-prevent-text-element-selection-with-cursor-drag
    // for maximum effect use:
    //      return pauseEvent(e);
    lib.pauseEvent = function(e){
        if(e.stopPropagation) e.stopPropagation();
        if(e.preventDefault) e.preventDefault();
        e.cancelBubble=true;
        // this started giving a jquery deprecation warning,
        // so I assume it's now useless
        // e.returnValue=false;
        return false;
    };

    // pad a number with zeroes, to given # of digits before the decimal point
    lib.lpad = function(val,digits){
        return String(val+Math.pow(10,digits)).substr(1);
    };

    // STATISTICS FUNCTIONS

    // aggregate numeric values, throwing out non-numerics.
    //   f: aggregation function (ie Math.min, etc)
    //   v: initial value (continuing from previous calls)
    //      if there's no continuing value, use null for selector-type
    //      functions (max,min), or 0 for summations
    //   a: array to aggregate (may be nested, we will recurse,
    //      but all elements must have the same dimension)
    //   len: maximum length of a to aggregate
    lib.aggNums = function(f,v,a,len) {
        var i;
        if(!len) { len=a.length; }
        if(!$.isNumeric(v)) { v=false; }
        if($.isArray(a[0])) {
            a = a.map(function(row){ return lib.aggNums(f,v,row); });
        }
        for(i=0; i<len; i++) {
            if(!$.isNumeric(v)) { v=a[i]; }
            else if($.isNumeric(a[i])) { v=f(v,a[i]); }
        }
        return v;
    };

    // mean & std dev functions using aggNums, so it handles non-numerics nicely
    // even need to use aggNums instead of .length, to toss out non-numerics
    lib.len = function(data) {
        return lib.aggNums(function(a){return a+1;},0,data);
    };

    lib.mean = function(data,len) {
        if(!len) { len = lib.len(data); }
        return lib.aggNums(function(a,b){return a+b;},0,data)/len;
    };

    lib.stdev = function(data,len,mean) {
        if(!len) { len = lib.len(data); }
        if(!$.isNumeric(mean)) {
            mean = lib.aggNums(function(a,b){return a+b;},0,data)/len;
        }
        return Math.sqrt(lib.aggNums(
            function(a,b){return a+Math.pow(b-mean,2);},0,data)/len);
    };

    // ------------------------------------------
    // debugging tools
    // ------------------------------------------

    // set VERBOSE to true to get a lot more logging and tracing
    lib.VERBOSE = false;

    // first markTime call will return time from page load
    lib.TIMER = new Date().getTime();

    // console.log that only runs if VERBOSE is on
    lib.log = function(){
        if(lib.VERBOSE){
            console.log.apply(console,arguments);
        }
    };

    // markTime - for debugging, mark the number of milliseconds
    // since the previous call to markTime and log arbitrary info too
    lib.markTime = function(v){
        if(!lib.VERBOSE) { return; }
        var t2 = new Date().getTime();
        console.log(v,t2-lib.TIMER,'(msec)');
        if(lib.VERBOSE==='trace') { console.trace(); }
        lib.TIMER=t2;
    };

    // constrain - restrict a number v to be between v0 and v1
    lib.constrain = function(v,v0,v1) {
        return Math.max(v0,Math.min(v1,v));
    };

    // -------------------------------------------------------- SPINNERS
    // allows spinners for multiple reasons on the same parent via spincount
    // spinner is only removed when spincount goes to zero

    // kill a spinner
    lib.killspin = function(parent){
        if(parent===undefined && typeof Tabs!=='undefined'){
            parent=Tabs.get();
        }
        if(!parent || !parent.spinner) {
            // something is wrong - kill all spinners
            $('.spinner').remove();
            return;
        }
        parent.spincount--;
        if(parent.spincount>0) { return; }
        parent.spinner.stop();
        // in case something weird happened and we had several spinners
        $(parent).find('.spinner').remove();
    };

    // start the main spinner
    lib.startspin = function(parent,spinsize,options){
        if(parent===undefined && typeof Tabs!=='undefined'){
            parent=Tabs.get();
        }
        options = options || {};
        if((typeof parent.spincount === 'number') && parent.spincount>0) {
            parent.spincount++;
        } else {
            parent.spincount=1;
            // big spinny
            var opts = {
                lines: 17, // The number of lines to draw
                length: 30, // The length of each line _30
                width: 6, // The line thickness
                radius: 37, // The radius of the inner circle
                corners: 1, // Corner roundness (0..1)
                rotate: 0, // The rotation offset
                direction: 1, // 1: clockwise, -1: counterclockwise
                color: '#000', // #rgb or #rrggbb
                speed: 1, // Rounds per second
                trail: 60, // Afterglow percentage
                shadow: false, // Whether to render a shadow
                hwaccel: false, // Whether to use hardware acceleration
                className: 'spinner', // The CSS class to assign to the spinner
                zIndex: 2e9, // The z-index (defaults to 2000000000)
                top: 'auto', // Top position relative to parent in px
                left: 'auto' // Left position relative to parent in px
            };
            // modify for tiny spinny
            if(spinsize==='tiny') {
                opts.lines = 13;
                opts.length = 5;
                opts.width = 2;
                opts.radius = 5;
                opts.corners = 0.6;
            }
            // apply optional options
            opts = $.extend({}, opts, options);
            var spinner=new Spinner(opts).spin(parent);
            parent.spinner=spinner;
        }
    };


    /**
     * notifier
     * @param {String} text The person's user name
     * @param {Number} [delay=1000] The delay time in milliseconds
     *          or 'long' which provides 2000 ms delay time.
     * @return {undefined} this function does not return a value
     */
    lib.notifier = function(text, displayLength) {

        var ts;
        if ($.isNumeric(displayLength)) ts = displayLength;
        else if (displayLength === 'long') ts = 2000;
        else ts = 1000;

        var notifierContainer = $('.notifier-container');
        if(!notifierContainer.length) {
            notifierContainer = $('<div class="notifier-container"></div>')
                .appendTo('#tabs-one-line,#embedded-graph');
        }

        if( $('div.notifier').text().indexOf(text) > 0 ) return;

        var n = $('<div class="notifier" style="display:none;">'+
            '<button class="notifier__close close" data-dismiss="alert">'+
                '&times;'+
            '</button>'+
            '<p class="push-half">'+text+'</p></div>');

        n.appendTo(notifierContainer)
            .fadeIn(700)
            .delay(ts)
            .fadeOut(700,function(){ n.remove(); });
    };

    lib.conf_modal = (function(){
        var options;
        function initialize(opts){
            // default options
            options = {
                header: '',
                body: '',
                conf_btn_txt: 'Done',
                canc_btn_txt: '',
                conf_func: function(){},
                canc_func: function(){},
                selector: 'body',
                hideonclick: true,
                closex: false,
                backdrop: true,
                alt_btn_txt: '',
                alt_func: function(){},
            };

            options = $.extend({}, options, opts);

            // set z-indices manually so that this modal appears
            // whereever it is bound
            var zi, backdropzi, modalzi;
            if($(options.selector).css('z-index') === 'auto'){
                zi = backdropzi = modalzi ='';
            } else{
                zi = $(options.selector).css('z-index');
                backdropzi = zi+1;
                modalzi = zi+2;
            }
            // backdrop w/custom z-index -- appears over the $(selector) element
            if(options.backdrop){
                $('.modal-backdrop:visible').hide();
                $(options.selector).first().append(
                    '<div id="confirmModalBackdrop" '+
                        'class="modal-backdrop confirmModal '+
                        (backdropzi==='' ? '' : 'style="z-index:'+backdropzi)+
                    '"></div>');
            }
            var confirmModal =
                '<div id="confirmModal" '+
                        'class="modal modal--default hide confirmModal" '+
                        'style="z-index:'+modalzi+'">'+
                  '<div class="modal__header">'+
                    (options.closex ?
                        '<button type="button" id="closeConfirmModal" '+
                        'class="close cm-canc_func" aria-hidden="true">'+
                            '&times;'+
                        '</button>' : '')+
                    '<h3 class="cm-header"></h3>'+
                  '</div>'+
                  '<div class="modal__body">'+
                    '<p class="cm-body"></p>'+
                  '</div>'+
                  '<div class="modal__footer">'+
                    '<button class="btn btn--small btn--cta2 cm-alt_btn_txt '+
                        'cm-alt_func"></button>'+
                    '<button class="btn btn--small btn--cta2 cm-canc_btn_txt '+
                        'cm-canc_func push-half--left"></button>'+
                    '<button class="btn btn--small btn--cta  cm-conf_btn_txt '+
                        'cm-conf_func push-half--left"></button>'+
                    '<div class="messages success--inline" '+
                        'style="text-align: right;"></div>'+
                  '</div>'+
                '</div>';

            $(options.selector).append(confirmModal);
            // backdrop=false because we add our own backdrop (bd)
            // with custom z-index
            $('#confirmModal').modal({'backdrop': false});

            // Fill it in
            applyOptions(options);
            // Destroy on hide
            $('#confirmModal').on('hide', function(){ destroy(); });
        }

        function destroy(){
            $('#confirmModalBackdrop').remove();
            $('#confirmModal').remove();
            $('.confirmModalBackdrop').remove();
            $('.confirmModal').remove();
        }

        function applyOptions(opts){
            function doConf(){
                if(options.hideonclick){ destroy(); }
                opts.conf_func();
                return false;
            }

            function doCanc(){
                if(options.hideonclick){ destroy(); }
                opts.canc_func();
                return false;
            }

            function doAlt(){
                if(options.hideonclick){ destroy(); }
                opts.alt_func();
                return false;
            }

            for(var key in opts){
                if($.inArray(key, ['header', 'body'])>-1){
                    $('#confirmModal .cm-'+key).html(opts[key]);
                } else if($.inArray(key,
                        ['alt_btn_txt', 'canc_btn_txt', 'conf_btn_txt'])>-1) {
                    if(opts[key]===''){
                        $('#confirmModal .cm-'+key).hide();
                    } else{
                        $('#confirmModal .cm-'+key).show();
                        $('#confirmModal .cm-'+key).html(opts[key]);
                    }
                } else if(key==='conf_func'){
                    $('#confirmModal .cm-conf_func')
                        .removeClass('disabled')
                        .off('click')
                        .on('click', doConf);
                }
                else if(key==='canc_func'){
                    $('#confirmModal .cm-canc_func')
                        .removeClass('disabled')
                        .off('click')
                        .on('click', doCanc);
                }
                else if(key==='alt_func'){
                    $('#confirmModal .cm-alt_func')
                        .removeClass('disabled')
                        .off('click')
                        .on('click', doAlt);
                }
            }
        }

        function updateOptions(opts){
            options = $.extend({}, options, opts);
            applyOptions(opts);
        }

        function addMsg(msg){
            $('#confirmModal .messages').html(msg);
        }

        function rmMsg(){
            addMsg('');
        }

        function disableConf(){
            $('#confirmModal .cm-conf_func')
                .addClass('disabled')
                .off('click');
        }

        function disableCanc(){
            $('#confirmModal .cm-canc_func')
                .addClass('disabled')
                .off('click');
        }

        return {
            init: initialize,
            settings: updateOptions,
            addMsg: addMsg,
            rmMsg: rmMsg,
            hide: destroy,
            disableConf: disableConf,
            disableCanc: disableCanc
        };
    })();


    // do two bounding boxes from getBoundingClientRect,
    // ie {left,right,top,bottom,width,height}, overlap?
    // takes optional padding pixels
    lib.bBoxIntersect = function(a,b,pad){
        pad = pad||0;
        return (a.left<=b.right+pad &&
                b.left<=a.right+pad &&
                a.top<=b.bottom+pad &&
                b.top<=a.bottom+pad);
    };

    // minor convenience/performance booster for d3...
    lib.identity = function(d){ return d; };

    var ORDINALS = [
        'first', 'second', 'third', 'fourth', 'fifth',
        'sixth', 'seventh', 'eighth', 'ninth'
    ];
    var ORDINALENDS = ['th', 'st', 'nd', 'rd'];
    var CARDINALS = [
        'zero', 'one', 'two', 'three', 'four',
        'five', 'six', 'seven', 'eight', 'nine'
    ];

    lib.num2ordinal = function(n) {
        // 1-9 -> first-ninth
        // 10 -> 10th
        // 11 -> 11th
        // etc
        // num2ordinal(true);     // true
        // num2ordinal(Infinity); // Infinity
        // num2ordinal(NaN);      // NaN
        // num2ordinal(void 0);   // undefined
        // From: http://stackoverflow.com/questions/12487422/
        //      take-a-value-1-31-and-convert-it-to-ordinal-date-w-javascript

        if((parseFloat(n) === parseInt(n,10)) && !isNaN(n)){
            if(parseInt(n,10)>=1 && parseInt(n,10)<=9){
                return ORDINALS[parseInt(n,10)-1];
            } else{
                var v = n%100;
                return n + (ORDINALENDS[(v-20)%10] ||
                            ORDINALENDS[v] || ORDINALENDS[0]);
            }
        }
        return n;
    };

    lib.ppn = function(n){
        // pretty print the number: 1-9 -> one-nine, >10 remain the same
        n = parseInt(n,10);
        return (n>=0 && n<=9 ? CARDINALS[n] : n);
    };

    // used to display and show html containers
    // HTML content must be formatted as:
    //      <div class="js-toggle--key js-toggle--key__value1">
    // if HTML Content:
    //      <div class="js-toggle--fruit js-toggle--fruit__oranges
    //                                   js-toggle--fruit__apples"></div>
    // then:
    //      togglecontent('', 'fruit', 'oranges');  // displays that div
    //      togglecontent('', 'fruit', 'kiwi');     // hides that div
    lib.togglecontent = function(parentSelector, dataKey, dataValue){
        $(parentSelector+' .js-toggle--'+dataKey).hide();
        $(parentSelector+' .js-toggle--'+dataKey+'__'+dataValue).show();
    };

    lib.plotlyurl = function(page){
        return window.location.origin+'/'+page;
    };

    // random string generator
    lib.randstr = function randstr(existing, bits, base) {
        /*
         * Include number of bits, the base of the string you want
         * and an optional array of existing strings to avoid.
         */
        if (!base) base = 16;
        if (bits === undefined) bits = 24;
        if (bits <= 0) return '0';
        var i,b,x;

        var digits = Math.log(Math.pow(2, bits)) / Math.log(base);
        for (i = 2; digits === Infinity; i *= 2) {
            digits = Math.log(Math.pow(2, bits / i)) / Math.log(base) * i;
        }

        var rem = digits - Math.floor(digits);

        var res = '';

        for (i = 0; i < Math.floor(digits); i++) {
            x = Math.floor(Math.random() * base).toString(base);
            res = x + res;
        }

        if (rem) {
            b = Math.pow(base, rem);
            x = Math.floor(Math.random() * b).toString(base);
            res = x + res;
        }

        var parsed = parseInt(res, base);
        if ( (existing && (existing.indexOf(res) > -1)) ||
             (parsed !== Infinity && parsed >= Math.pow(2, bits)) ) {
            return randstr(existing, bits, base);
        }
        else return res;
    };


    lib.OptionControl = function(opt, optname) {
        /*
         * An environment to contain all option setters and
         * getters that collectively modify opts.
         *
         * You can call up opts from any function in new object
         * as this.optname || this.opt
         *
         * See FitOpts for example of usage
         */
        if (!opt) { opt = {}; }
        if (!optname) { optname = 'opt'; }

        var self = {};
        self.optionList = [];

        self._newoption = function(optObj) {
            optObj[optname] = opt;
            self[optObj.name] = optObj;
            self.optionList.push(optObj);
        };

        self['_'+optname] = opt;
        return self;
    };


    // lib.smooth: smooth arrayIn by convolving with
    // a hann window with given full width at half max
    // bounce the ends in, so the output has the same length as the input
    lib.smooth = function(arrayIn, FWHM) {
        var w = [], arrayOut = [], i, j, k, v;

        FWHM = Math.round(FWHM); // only makes sense for integers
        if(FWHM<2) { return arrayIn; }

        // first make the window array
        for(i=1; i<2*FWHM; i++) {
            w.push((1-Math.cos(Math.PI*i/FWHM))/(2*FWHM));
        }

        // now do the convolution
        var wlen = w.length, alen = arrayIn.length;
        for(i=0; i<alen; i++) {
            v = 0;
            for(j=0; j<wlen; j++) {
                k = i+j+1-FWHM;
                if(k<0) { k = -1-k; }
                else if(k>=alen) { k = 2*alen-1-k; }
                v += arrayIn[k]*w[j];
            }
            arrayOut.push(v);
        }
        return arrayOut;
    };

    lib.getSources = function(td) {
        var fid = lib.fullFid(td.fid);
        var extrarefs = (td.ref_fids||[]).join(',');
        if(!fid && !extrarefs) { return; }
        $.get('/getsources', {fid:fid, extrarefs:extrarefs}, function(res) {
            td.sourcelist = JSON.parse(res);
            if(!$.isArray(td.sourcelist)) {
                console.log('sourcelist error',td.sourcelist);
                td.sourcelist = [];
            }
            lib.showSources(td);
        });
    };

    // fullfid - include the username in fid whether it was there or not
    // also strip out backslash if one was there for selectability
    // and turn tree roots into -1
    lib.fullFid = function(fid) {
        if (typeof fid === 'number') { fid = String(fid); }
        if (typeof fid !== 'string' || fid==='') { return ''; }
        if (fid.substr(fid.length-4)==='tree') { return '-1'; }
        return ($.isNumeric(fid) && window.user ?
            (window.user+':'+fid) : fid).replace('\\:',':');
    };

    lib.showSources = function(td) {
        // show the sources of data in the active tab
        var allsources = td.sourcelist;
        if(!allsources) {
            lib.getSources(td);
            return;
        }
        var container = d3.select(td).select('.js-sourcelinks'),
            extsources = allsources.filter(function(v){
                return $.isNumeric(v.ref_fid);
            }),
            firstsource = extsources[0] || allsources[0];
        container.text('');
        td.shouldshowsources = false;
        // no sources at all? quit
        if(!firstsource) { return; }

        // find number of unique internal and external sources
        var extobj = {}, plotlyobj = {};
        extsources.forEach(function(v){ extobj[v.url] = 1; });
        allsources.forEach(function(v){
            if(!$.isNumeric(v.ref_fid)){ plotlyobj[v.ref_fid] = 1; }
        });

        var fidparts = String(firstsource.ref_fid).split(':'),
            isplot = $(td).hasClass('js-plotly-plot'),
            mainsite = Boolean($('#plotlyMainMarker').length),
            mainlink,
            extraslink;

        if(isplot) { // svg version for plots
            // only sources from the same user? also quit, if we're on a plot
            var thisuser = firstsource.fid.split(':')[0];
            if(allsources.every(function(v){
                    return String(v.ref_fid).split(':')[0]===thisuser;
                })) {
                return;
            }
            td.shouldshowsources = true;
            // in case someone REALLY doesn't want to show sources
            // they can hide them...
            // but you can always see them by going to the grid
            if(td.layout.hidesources) { return; }
            container.append('tspan').text('Source: ');
            mainlink = container.append('a').attr({'xlink:xlink:href':'#'});
            if($.isNumeric(firstsource.ref_fid)) {
                mainlink.attr({
                    'xlink:xlink:show':'new',
                    'xlink:xlink:href':firstsource.ref_url
                });
            }
            else if(!mainsite){
                mainlink.attr({
                    'xlink:xlink:show':'new',
                    'xlink:xlink:href':'/'+fidparts[1]+'/~'+fidparts[0]
                });
            }

            if(allsources.length>1) {
                container.append('tspan').text(' - ');
                extraslink = container.append('a')
                    .attr({'xlink:xlink:href':'#'});
            }
        }
        else { // html version for grids (and scripts?)
            if(!container.node()) {
                container = d3.select(td).select('.grid-container')
                    .append('div')
                        .attr('class', 'grid-sourcelinks js-sourcelinks');
            }
            container.append('span').text('Source: ');
            mainlink = container.append('a').attr({
                'href':'#',
                'class': 'link--impt'
            });
            if($.isNumeric(firstsource.ref_fid)) {
                mainlink.attr({
                    'target':'_blank',
                    'href':firstsource.ref_url
                });
            }

            if(allsources.length>1) {
                container.append('span').text(' - ');
                extraslink = container.append('a')
                .attr({ href:'#' })
                .classed('link--impt',true);
            }
        }

        mainlink.text(firstsource.ref_filename);

        function pullSource(){
            pullf({fid:firstsource.ref_fid});
            return false;
        }

        function fullSourcing(){
            var sourceModal = $('#sourceModal');
            var sourceViewer = sourceModal.find('#source-viewer').empty();
            sourceViewer.data('jsontree', '')
                .jsontree(JSON.stringify(sourceObj),
                    {terminators:false, collapsibleOuter:false})
                .show();
            if(mainsite) {
                sourceModal.find('[data-fid]').click(function(){
                    sourceModal.modal('hide');
                    pullf({fid:$(this).attr('data-fid')});
                    return false;
                });
            }
            else {
                sourceModal.find('[data-fid]').each(function(){
                    fidparts = $(this).attr('data-fid').split(':');
                    $(this).attr({href:'/~'+fidparts[0]+'/'+fidparts[1]});
                });
                if(window.self!==window.top) {
                    // in an iframe: basically fill the frame
                    sourceModal.css({
                        left: '10px',
                        right: '10px',
                        bottom: '10px',
                        width: 'auto',
                        height: 'auto',
                        margin: 0
                    });
                }
            }
            sourceModal.modal('show');

            sourceModal.find('.close')
                .off('click')
                .on('click', function(){
                    sourceModal.modal('hide');
                    return false;
                });
            return false;
        }

        if(!isplot || td.mainsite) {
            mainlink.on('click',pullSource);
        }
        if(extraslink) {
            extraslink.text('Full list')
                .on('click',fullSourcing);
        }

        function makeSourceObj(container, refByUid) {
            if(cnt<0) { console.log('infinite loop?'); return container; }
            cnt--;
            allsources.forEach(function(src){
                if(src.ref_by_uid===refByUid) {
                    var linkval;
                    if($.isNumeric(src.ref_fid)) {
                        linkval = '<a href="'+src.ref_url+'" target="_blank">'+
                            src.ref_filename+'</a>';
                    }
                    else {
                        var refUser = src.ref_fid.split(':')[0],
                            fn = (refUser!==window.user ? refUser+': ' : '') +
                                src.ref_filename;
                        linkval = '<a href="#" data-fid="'+src.ref_fid+'">'+
                            fn+'</a>';
                    }
                    container[linkval] = makeSourceObj({},src.uid);
                }
            });
            return container;
        }

        var cnt = allsources.length,
            sourceObj = makeSourceObj({}, null);
    };

    /*
     * isEmpty
     * @UTILITY
     * check if object is empty and all arrays strings
     * and objects within are empty
     */
    lib.isEmpty = function isEmpty (obj) {
        /*
         * Recursively checks for empty arrays,
         * objects and empty strings, nulls and undefined
         * and objects and arrays that
         * only contain empty arrays, objects
         * and strings and so on.
         *
         * false and NaN are NOT EMPTY... they contain information...
         */
        function definiteEmpty (obj) {
            return ( obj === null ||
                  obj === undefined ||
                  obj === '' );
        }

        function definiteValue (obj) {
            return !definiteEmpty && typeof(obj) !== 'object';
        }

        // is definitely empty
        if (definiteEmpty(obj)) { return true; }
        // is definitely full
        if (typeof(obj) !== 'object') return false;

        // it's indefinite. Scan for possible information.
        // (non empty values and non empty objects)
        if (Object.keys(obj)
                .map( function (key) { return definiteValue(obj[key]); } )
                .some( function (bool) { return bool; } ) )  {
            return true;
        }
        // Object contains only indefinite and falsey values - recurse
        return !Object.keys(obj)
                .some( function (key) {return !isEmpty(obj[key]); } );
    };

    /*
     * purgeStreams
     * @UTILITY
     * remove stream properties from data objects
     */
    lib.purgeStream = function purgeStream (dobj) {
        var data = dobj.data;
        if (!(data && data.length)) { return; }
        data.forEach(function (d) { delete d.stream; });
    };

    /*
     * Dropdown Selector
     *
     * A basic JQUERY + bootstrap implementation
     * Pass in a specification object with:
     * {
     *   items: array of items
     *   callback: an optional callback to be called on item selection:
     *       cb(item, itemindex)
     *   defaults: An array index of the item to initialize with, defaults to 0
     * }
     */
    lib.dropdownSelector = function dropdownSelector (spec) {
        // return the select control for mixed types

        var items = spec.items;
        spec.defaults = spec.defaults || 0;
        var cls = spec.cls || '';
        // http://getbootstrap.com/2.3.2/javascript.html#dropdowns
        var $html = $('<div class="dropdown '+ cls +'">'+
                '<a class="link--default link--blocky '+
                        'dropdown-toggle--fixed-width js-dropdown-text" '+
                        'data-toggle="dropdown" data-target="#" href="/">'+
                     '<span class="caret user-caret"></span>'+
                '</a>'+
                    '<ul class="dropdown-menu dropdown-toggle--fixed-width" '+
                        'role="menu"></ul>'+
            '</div>');

        var $ul = $html.find('ul');
        var $aShow = $html.find('.js-dropdown-text');

        items.forEach( function (item, idx) {

            var $li = $( '<li>'+
                           '<a href="#">'+
                             item +
                           '</a>' +
                         '</li>'
                       );

            $li.click( function ( ) {
                $aShow.html( item + '<span class="caret user-caret"></span>');
                if (spec.callback) spec.callback(item, idx);
            });

            $ul.append($li);

            if (idx === spec.defaults) $li.click();
        });

        return $html;
    };

    // helpers for promises

    // promiseError: log errors properly inside promises
    // use:
    // <promise>.then(undefined,Plotly.Lib.promiseError) (for IE compatibility)
    // or <promise>.catch(Plotly.Lib.promiseError)
    // TODO: I guess we need another step to send this error to Sentry?
    lib.promiseError = function(err) { console.log(err, err.stack); };

    // syncOrAsync: run a sequence of functions synchronously
    // as long as its returns are not promises (ie have no .then)
    // includes one argument arg to send to all functions...
    // this is mainly just to prevent us having to make wrapper functions
    // when the only purpose of the wrapper is to reference gd / td
    // and a final step to be executed at the end
    // TODO: if there's an error and everything is sync,
    // this doesn't happen yet because we want to make sure
    // that it gets reported
    lib.syncOrAsync = function(sequence, arg, finalStep) {
        var ret, fni;

        function continueAsync(){
            lib.markTime('async done '+fni.name);
            return lib.syncOrAsync(sequence, arg, finalStep);
        }
        while(sequence.length) {
            fni = sequence.splice(0,1)[0];
            ret = fni(arg);
            // lib.markTime('done calling '+fni.name)
            if(ret && ret.then) {
                return ret.then(continueAsync)
                    .then(undefined,lib.promiseError);
            }
            lib.markTime('sync done '+fni.name);
        }

        return finalStep && finalStep(arg);
    };

    // our own dot function so that we don't need to include numeric
    lib.dot = function(x, y) {
        if (!(x.length && y.length) || x.length !== y.length) {
            return null;
        }
        if (x.length === 0) {
            return x;
        }

        // transpose taken from:
        // http://stackoverflow.com/questions/4492678/
        //    to-swap-rows-with-columns-of-matrix-in-javascript-or-jquery
        function transpose(a) {
            return Object.keys(a[0]).map(
                function (c) { return a.map(function (r) { return r[c]; }); });
        }

        // two-arg zip
        function zip(x,y) {
            var ret = [];
            for (var i = 0; i < x.length; ++i)
                ret = ret.concat([[x[i], y[i]]]);
            return ret;
        }

        function sumSqr(a,x) { return a + x[0]*x[1]; }
        function vecMat(y) { return lib.dot(x, y); }
        function matVec(x) { return lib.dot(x, y); }

        // dot itself
        if (!x[0].length) {
            if (!y[0].length) {
                // vec-vec
                return zip(x, y).reduce(sumSqr, 0);
            }
            else {
                // vec-mat
                return transpose(y).map(vecMat);
            }
        }
        else {
            // mat-vec or mat-mat
            return x.map(matVec);
        }
    };


    // Functions to manipulate 2D transformation matrices

    // translate by (x,y)
    lib.translationMatrix = function (x, y) {
        return [[1, 0, x], [0, 1, y], [0, 0, 1]];
    };

    // rotate by alpha around (0,0)
    lib.rotationMatrix = function (alpha) {
        var a = alpha*Math.PI/180;
        return [[Math.cos(a), -Math.sin(a), 0],
                [Math.sin(a), Math.cos(a), 0],
                [0, 0, 1]];
    };

    // rotate by alpha around (x,y)
    lib.rotationXYMatrix = function(a, x, y) {
        return lib.dot(
            lib.dot(lib.translationMatrix(x, y),
                        lib.rotationMatrix(a)),
            lib.translationMatrix(-x, -y));
    };

    // applies a 2D transformation matrix to either
    // x and y params or an [x,y] array
    lib.apply2DTransform = function(transform) {
        return function() {
            var args = arguments;
            if (args.length === 3) {
                args = args[0];
            }//from map
            var xy = arguments.length === 1 ? args[0] : [args[0], args[1]];
            return lib.dot(transform, [xy[0], xy[1], 1]).slice(0,2);
        };
    };

    // applies a 2D transformation matrix to an [x1,y1,x2,y2] array (to
    // transform a segment)
    lib.apply2DTransform2 = function(transform) {
        var at = lib.apply2DTransform(transform);
        return function(xys) {
            return at(xys.slice(0,2)).concat(at(xys.slice(2,4)));
        };
    };

    // Helper to strip trailing slash, from http://stackoverflow.com/questions/6680825/return-string-without-trailing-slash
    lib.stripTrailingSlash = function (str) {
        if (str.substr(-1) == '/') {
            return str.substr(0, str.length - 1);
        }
        return str;
    };

}()); // end Lib object definition