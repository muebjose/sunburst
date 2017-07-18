import {format} from 'd3-format';
import {select} from 'd3-selection';
import {ascending} from 'd3-array';
import {
  scaleOrdinal,
  schemeCategory20
} from 'd3-scale';
import {
  arc
} from 'd3-shape';
import {
  hierarchy,
  partition
} from 'd3-hierarchy';
import {
  nest
} from 'd3-collection';
import {transition} from 'd3-transition';


export default function (el, instance, dispatch_) {
  // would be much nicer to implement transitions/animation
  // remove previous in case of Shiny/dynamic
  select(el).select(".sunburst-chart svg").remove();

  var x = instance.x;
  var json = instance.json;
  var chart = instance.chart;

  // Dimensions of sunburst
  var width = el.getBoundingClientRect().width - (x.options.legend.w ? x.options.legend.w : 75);
  var height = el.getBoundingClientRect().height - 70;
  var radius = Math.min(width, height) / 2;

  select(el).select(".sunburst-chart").append("svg")
    .style("width", width + "px") // shouldnt have to do this
    .style("height", height + "px"); // shouldnt have to do this

  // Breadcrumb dimensions: width, height, spacing, width of tip/tail.
  //  these will be the defaults
  var b = {
    w: 0, h: 30, s: 3, t: 10
  };
  //  if breadcrumb is provided in the option, we will overwrite
  //   with what is provided
  Object.keys(x.options.breadcrumb).map(function(ky){
    b[ky] = x.options.breadcrumb[ky];
  });
/*
  // Mapping of step names to colors.
  var colors = {
    "home": "#5687d1",
    "product": "#7b615c",
    "search": "#de783b",
    "account": "#6ab975",
    "other": "#a173d1",
    "end": "#bbbbbb"
  };
*/

  var colors = scaleOrdinal(schemeCategory20);

  if(x.options.colors !== null){
    // if an array then we assume the colors
    //  represent an array of hexadecimal colors to be used
    if(Array.isArray(x.options.colors)) {
      try{
        colors.range(x.options.colors)
      } catch(e) {

      }
    }

    // if an object with range then we assume
    //  that this is an array of colors to be used as range
    if(x.options.colors.range){
      try{
        colors.range(x.options.colors.range)
      } catch(e) {

      }
    }

    // if an object with domain then we assume
    //  that this is an array of colors to be used as domain
    //  for more precise control of the colors assigned
    if(x.options.colors.domain){
      try{
        colors.domain(x.options.colors.domain);
      } catch(e) {

      }
    }

    // if a function then set to the function
    if(typeof(x.options.colors) === "function") {
      colors = x.options.colors;
    }
  }
  // Total size of all segments; we set this later, after loading the data.
  var totalSize = 0;

  var vis = select(el).select(".sunburst-chart").select("svg")
      .append("g")
      .attr("id", el.id + "-container")
      .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")");

  var partitioner = partition()
      .size([2 * Math.PI, radius * radius]);

  var arc_shape = arc()
      .startAngle(function(d) { return d.x0; })
      .endAngle(function(d) { return d.x1; })
      .innerRadius(function(d) { return Math.sqrt(d.y0); })
      .outerRadius(function(d) { return Math.sqrt(d.y1); });

  createVisualization(json);

  // set up a container for tasks to perform after completion
  //  one example would be add callbacks for event handling
  //  styling
  if (!(typeof x.tasks === "undefined") ){
    if ( (typeof x.tasks.length === "undefined") ||
     (typeof x.tasks === "function" ) ) {
       // handle a function not enclosed in array
       // should be able to remove once using jsonlite
       x.tasks = [x.tasks];
    }
    x.tasks.map(function(t){
      // for each tasks call the task with el supplied as `this`
      t.call({el:el,x:x,instance:instance});
    });
  }

  // Main function to draw and set up the visualization, once we have the data.
  function createVisualization(json) {

    // Basic setup of page elements.
    initializeBreadcrumbTrail();

    // Bounding circle underneath the sunburst, to make it easier to detect
    // when the mouse leaves the parent g.
    vis.append("circle")
        .attr("r", radius)
        .style("opacity", 0);

    // Turn the data into a d3 hierarchy and calculate the sums.
    var root = hierarchy(json)
        .sum(function(d) { return d[x.options.valueField || "size"]; });

    // check for sort function
    if(x.options.sortFunction){
      root.sort(x.options.sortFunction);
    }

    // For efficiency, filter nodes to keep only those large enough to see.
    var nodes = partitioner(root).descendants()
        .filter(function(d) {
            return (d.x1 - d.x0 > 0.005); // 0.005 radians = 0.29 degrees
        });

    var path = vis.data([json]).selectAll("path")
        .data(nodes)
        .enter().append("path")
        .attr("display", function(d) { return d.depth ? null : "none"; })
        .attr("d", arc_shape)
        .attr("fill-rule", "evenodd")
        .style("fill", function(d) { return colors.call(this, d.data.name); })
        .style("opacity", 1)
        .on("mouseover", mouseover)
        .on("click", click);

    // Add the mouseleave handler to the bounding circle.
    select(el).select("#"+ el.id + "-container").on("mouseleave", mouseleave);

    // Get total size of the tree = value of root node from partition.
    totalSize = path.datum().value;

    drawLegend(nodes);
    select(el).select(".sunburst-togglelegend").on("click", toggleLegend);

   }

  // Fade all but the current sequence, and show it in the breadcrumb trail.
  function mouseover(d) {

    //var percentage = (100 * d.value / totalSize).toPrecision(3);
    //var percentageString = percentage + "%";
    //if (percentage < 0.1) {
    //  percentageString = "< 0.1%";
    //}
    
    //var totalvalue = (d.value).toPrecision(3);
    var percentageString = "Score: " + (d.value).toPrecision(3);
    
    
    var countString = [
        '<span style = "font-size:.7em">',
        format("1.2s")(d.value) + ' of ' + format("1.2s")(totalSize),
        '</span>'
      ].join('')

    var explanationString = "";
    if(x.options.percent && x.options.count){
      explanationString = percentageString + '<br/>' + countString;
    } else if(x.options.percent){
      explanationString = percentageString;
    } else if(x.options.count){
      explanationString = countString;
    }

    //if explanation defined in R then use this instead
    if(x.options.explanation !== null){
      explanationString = x.options.explanation.bind(totalSize)(d);
    }


    select(el).selectAll(".sunburst-explanation")
        .style("visibility", "")
        .style("top",((height - 70)/2) + "px")
        .style("width",width + "px")
        .html(explanationString);

    var sequenceArray = d.ancestors().reverse();
    sequenceArray.shift(); // remove root node from the array

    chart._selection = sequenceArray.map(
      function(d){return d.data.name}
    );
    dispatch_.call("mouseover", chart._selection);

    updateBreadcrumbs(sequenceArray, percentageString);

    // Fade all the segments.
    select(el).selectAll("path")
        .style("opacity", 0.3);

    // Then highlight only those that are an ancestor of the current segment.
    vis.selectAll("path")
        .filter(function(node) {
                  return (sequenceArray.indexOf(node) >= 0);
                })
        .style("opacity", 1);
  }

  // Restore everything to full opacity when moving off the visualization.
  function mouseleave(d) {

    dispatch_.call("mouseleave", chart._selection);
    chart._selection = [];

    // Hide the breadcrumb trail
    select(el).select("#" + el.id + "-trail")
        .style("visibility", "hidden");

    // Deactivate all segments during transition.
    select(el).selectAll("path").on("mouseover", null);

    // Transition each segment to full opacity and then reactivate it.
    select(el).selectAll("path")
        .transition()
        .duration(1000)
        .style("opacity", 1)
        .on("end", function() {
          select(this).on("mouseover", mouseover);
        });

    select(el).selectAll(".sunburst-explanation")
        .style("visibility", "hidden");
  }

  function click(d,i) {
    var sequenceArray = d.ancestors().reverse();
    sequenceArray.shift(); // remove root node from the array

    dispatch_.call("click", sequenceArray.map(
      function(d){return d.data.name}
    ));
  }

  function initializeBreadcrumbTrail() {
    // Add the svg area.
    var trail = select(el).select(".sunburst-sequence").append("svg")
        .attr("width", width)
        //.attr("height", 50)
        .attr("id", el.id + "-trail");
    // Add the label at the end, for the percentage.
    trail.append("text")
      .attr("id", el.id + "-endlabel")
      .style("fill", "#000");
  }

  // Generate a string that describes the points of a breadcrumb polygon.
  function breadcrumbPoints(d, i) {
    var points = [];
    points.push("0,0");
    if (b.w <= 0) {
      // calculate breadcrumb width based on string length
      points.push(d.string_length + ",0");
      points.push(d.string_length + b.t + "," + (b.h / 2));
      points.push(d.string_length + "," + b.h);
    } else {
      points.push(b.w + ",0");
      points.push(b.w + b.t + "," + (b.h / 2));
      points.push(b.w + "," + b.h);
    }
    points.push("0," + b.h);

    if (i > 0) { // Leftmost breadcrumb; don't include 6th vertex.
      points.push(b.t + "," + (b.h / 2));
    }
    return points.join(" ");
  }

  // Update the breadcrumb trail to show the current sequence and percentage.
  function updateBreadcrumbs(nodeArray, percentageString) {

    // Data join; key function combines name and depth (= position in sequence).
    var g = select(el).select("#" + el.id + "-trail")
        .selectAll("g")
        .data(nodeArray, function(d) { return d.data.name + d.depth; });

    // Add breadcrumb and label for entering nodes.
    var entering = g.enter().append("g");


    if (b.w <= 0) {
      // Create a node array that contains all the breadcrumb widths
      // Calculate positions of breadcrumbs based on string lengths
      var curr_breadcrumb_x = 0;
      nodeArray[0].breadcrumb_x = 0;
      nodeArray[0].breadcrumb_h = 0;

      entering.append("polygon")
          .style("z-index",function(d,i) { return(999-i); })
          .style("fill", function(d) { return colors.call(this, d.data.name); });

      entering.append("text")
          .attr("x", b.t + 2)
          .attr("y", b.h / 2)
          .attr("dy", "0.35em")
          .attr("text-anchor", "left")
          .text(function(d) { return d.data.name; });

      // Remove exiting nodes.
      g.exit().remove();

      // loop through each g element
      //  calculate string length
      //  draw the breadcrumb polygon
      //  and determine if breadcrumb should be wrapped to next row
      entering.merge(g).each(function(d,k){
        var crumbg = select(this);
        var my_string_length = crumbg.select("text").node().getBoundingClientRect().width;
        nodeArray[k].string_length = my_string_length + 12;
        crumbg.select("polygon").attr("points", function(d){
          return breadcrumbPoints(d, k);
        });
        var my_g_length = crumbg.node().getBoundingClientRect().width;
        curr_breadcrumb_x += k===0 ? 0 : nodeArray[k-1].string_length + b.s;
        nodeArray[k].breadcrumb_h = k===0 ? 0 : nodeArray[k-1].breadcrumb_h;

        if (curr_breadcrumb_x + my_g_length > width*0.99) {
          nodeArray[k].breadcrumb_h += b.h;  // got to next line
          curr_breadcrumb_x = b.t + b.s;     // restart counter
        }
        nodeArray[k].breadcrumb_x = curr_breadcrumb_x;
      });


      // Set position for entering and updating nodes.
      entering.merge(g).attr("transform", function(d, i) {
        return "translate(" + d.breadcrumb_x + ", "+d.breadcrumb_h+")";
      });


      // Now move and update the percentage at the end.
      select(el).select("#" + el.id + "-trail").select("#" + el.id + "-endlabel")
          .attr("x", function(d){
            var bend = select(this);
            var curr_breadcrumb_x = nodeArray[nodeArray.length-1].breadcrumb_x +  nodeArray[nodeArray.length-1].string_length + b.t + b.s;
            var my_g_length = bend.node().getBoundingClientRect().width;

            var curr_breadcrumb_h = nodeArray[nodeArray.length-1].breadcrumb_h + b.h/2;
            if (curr_breadcrumb_x + my_g_length > width*0.99) {
              curr_breadcrumb_h += b.h + b.h/2;
              curr_breadcrumb_x = b.t + b.s;     // restart counter
            }
            bend.datum({
              "breadcrumb_x": curr_breadcrumb_x,
              "breadcrumb_h": curr_breadcrumb_h
            });
            return curr_breadcrumb_x;
          })
          .attr("y", function(d){return d.breadcrumb_h})
          .attr("dy", "0.35em")
          .attr("text-anchor", "start")
          .text(percentageString);


    } else {
      entering.append("polygon")
          .attr("points", breadcrumbPoints)
          .style("fill", function(d) { return colors.call(this, d.data.name); });

      entering.append("text")
          .attr("x", (b.w + b.t) / 2)
          .attr("y", b.h / 2)
          .attr("dy", "0.35em")
          .attr("text-anchor", "middle")
          .text(function(d) { return d.data.name; });

      // Set position for entering and updating nodes.
      entering.merge(g).attr("transform", function(d, i) {
        return "translate(" + i * (b.w + b.s) + ", 0)";
      });

      // Remove exiting nodes.
      g.exit().remove();

      // Now move and update the percentage at the end.
      select(el).select("#" + el.id + "-trail").select("#" + el.id + "-endlabel")
          .attr("x", (nodeArray.length + 0.5) * (b.w + b.s))
          .attr("y", b.h / 2)
          .attr("dy", "0.35em")
          .attr("text-anchor", "middle")
          .text(percentageString);

    }

    // Make the breadcrumb trail visible, if it's hidden.
    select(el).select("#" + el.id + "-trail")
        .style("visibility", "");

  }

  function drawLegend(nodes) {

    // Dimensions of legend item: width, height, spacing, radius of rounded rect.
    var li = {
      w: 75, h: 30, s: 3, r: 3
    };

    //  if legend is provided in the option, we will overwrite
    //   with what is provided
    Object.keys(x.options.legend).map(function(ky){
      li[ky] = x.options.legend[ky];
    });

    // remove if already drawn
    select(el).select(".sunburst-legend svg").remove();

    // get labels from node names
    var labels = nest()
      .key(function(d) {return d.data.name})
      .entries(
        nodes.sort(
          function(a,b) {return ascending(a.depth,b.depth)}
        )
      )
      .map(function(d) {
        return d.values[0];
      })
      .filter(function(d) {
        return d.data.name !== "root";
      });

    var legend = select(el).select(".sunburst-legend").append("svg")
        .attr("width", li.w)
        .attr("height", labels.length * (li.h + li.s));

    var g = legend.selectAll("g")
        .data( function(){
          if(x.options.legendOrder !== null){
            return x.options.legendOrder.map(function(d) {
              return labels.filter(function(dd) {return dd.data.name === d })[0];
            });
          } else {
            // get sorted by top level
            return labels;
          }
        })
        .enter().append("g")
        .attr("transform", function(d, i) {
                return "translate(0," + i * (li.h + li.s) + ")";
             });

    g.append("rect")
        .attr("rx", li.r)
        .attr("ry", li.r)
        .attr("width", li.w)
        .attr("height", li.h)
        .style("fill", function(d) { return colors.call(this, d.data.name); });

    g.append("text")
        .attr("x", li.w / 2)
        .attr("y", li.h / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .text(function(d) { return d.data.name; });
  }

  function toggleLegend() {
    var legend = select(el).select(".sunburst-legend")
    if (legend.style("visibility") == "hidden") {
      legend.style("visibility", "");
    } else {
      legend.style("visibility", "hidden");
    }
  }
};
