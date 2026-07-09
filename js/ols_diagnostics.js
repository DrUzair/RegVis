/*
 * RegVis – Interactive Regression Visualization
 * Copyright (c) 2022 Uzair Ahmad (Spimelab Inc.)
 * Hamna Uzair (University of Toronto)
 * Licensed under the MIT License
 * See LICENSE file for details
 */


(function () {
  'use strict';

  // Preserve globals expected by the page.
  window.new_data = [];
  window.x_axis_label = 'x';
  window.y_axis_label = 'y';
  window.margin = { top: 10, right: 30, bottom: 50, left: 60 };

  window.max_x_scale = parseInt(document.getElementById('input_maxx').value, 10);
  window.min_x_scale = parseInt(document.getElementById('input_minx').value, 10);
  window.max_y_scale = parseInt(document.getElementById('input_maxy').value, 10);
  window.min_y_scale = parseInt(document.getElementById('input_miny').value, 10);

  const reg_svg_w_innerWidth = 0.70;
  const reg_svg_h_innerHeight = 0.70;
  const residuals_plot_w_innerWidth = 0.20;
  const residuals_plot_h_innerHeight = 0.30;
  const norm_plot_w_innerWidth = 0.20;
  const norm_plot_h_innerHeight = 0.30;

  window.reg_svg_width = Math.floor(window.innerHeight * reg_svg_w_innerWidth);
  window.reg_svg_height = Math.floor(window.innerHeight * reg_svg_h_innerHeight);

  window.pi_alpha = parseInt(document.getElementById('pi_alpha_slider').value, 10);
  window.ci_alpha = parseInt(document.getElementById('ci_alpha_slider').value, 10);
  window.stats = {};

  const regression_ci_upper_line = d3.line();
  const regression_ci_lower_line = d3.line();
  const regression_pi_upper_line = d3.line();
  const regression_pi_lower_line = d3.line();

  const app = {
    obsCounter: 0,
    hoveredObsId: null,
    activeSquareObsIds: [],
    sampleTraces: [],
    mainRoot: null,
    plot: null,
    backgroundLayer: null,
    axesLayer: null,
    squaresLayer: null,
    linesLayer: null,
    pointsLayer: null,
    overlayLayer: null,
    summaryLayer: null,
    controlsLayer: null,
    hoverCircle: null,
    hoverText: null,
    background: null,
    summaryVisible: false,
    summaryBody: null,
    summaryToggle: null,
    residualRoot: null,
    residualPlot: null,
    residualHoverCircle: null,
    residualHoverText: null,
    residualWidth: 0,
    residualHeight: 0,
    residualXScale: null,
    residualYScale: null,
    qqRoot: null,
    qqPlot: null,
    qqHoverCircle: null,
    qqHoverText: null,
    qqWidth: 0,
    qqHeight: 0,
    qqXScale: null,
    qqYScale: null,
    xScale: null,
    yScale: null,
    reader: new FileReader(),
    config: {
      maxSquares: 5,
      samplePercent: 70,
      pointRadius: 8
    }
  };

  function round(number, decimal) {
    decimal = decimal === undefined ? 2 : decimal;
    return Math.round(number * Math.pow(10, decimal)) / Math.pow(10, decimal);
  }
  window.round = round;

  function updateMainScales() {
    app.xScale = d3.scaleLinear()
      .domain([window.min_x_scale, window.max_x_scale])
      .range([0, window.reg_svg_width]);

    app.yScale = d3.scaleLinear()
      .domain([window.min_y_scale, window.max_y_scale])
      .range([window.reg_svg_height, 0]);

    window.x = app.xScale;
    window.y = app.yScale;
  }


function inlineExportStyles(originalSvgNode, clonedSvgNode) {
  const originalNodes = originalSvgNode.querySelectorAll('*');
  const clonedNodes = clonedSvgNode.querySelectorAll('*');

  const styleProps = [
    'fill',
    'fill-opacity',
    'stroke',
    'stroke-opacity',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-dasharray',
    'opacity',
    'font-size',
    'font-family',
    'font-weight',
    'text-anchor',
    'alignment-baseline'
  ];

  originalNodes.forEach(function (sourceNode, i) {
    const targetNode = clonedNodes[i];
    if (!targetNode) return;

    const computed = window.getComputedStyle(sourceNode);
    styleProps.forEach(function (prop) {
      const value = computed.getPropertyValue(prop);
      if (value) {
        targetNode.setAttribute(prop, value);
      }
    });
  });
}


function serializeSvgNode(svgNode) {
  const clone = svgNode.cloneNode(true);

  const controlsLayer = clone.querySelector('.controls-layer');
  if (controlsLayer) controlsLayer.remove();

  clone.querySelectorAll('foreignObject').forEach(function (node) {
    const txt = node.textContent || '';
    if (txt.includes('Config') || txt.includes('Download')) {
      node.remove();
    }
  });

  inlineExportStyles(svgNode, clone);

  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(clone);

  if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
    source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  if (!source.match(/^<svg[^>]+xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/)) {
    source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  }

  return '<?xml version="1.0" standalone="no"?>\r\n' + source;
}


  function clearContainer(selector) {
    d3.select(selector).selectAll('*').remove();
  }

  function getConfiguredMaxSquares() {
    return app.config.maxSquares === 'all' ? window.new_data.length : app.config.maxSquares;
  }

  function getOrderedData(includeUnsampled) {
    return window.new_data.slice().sort(function (a, b) {
      return d3.ascending(a.x, b.x);
    }).filter(function (d) {
      return includeUnsampled || d.sample;
    });
  }

  function findDatumByObsId(obsId) {
    for (let i = 0; i < window.new_data.length; i += 1) {
      if (window.new_data[i].obs_id === obsId) return window.new_data[i];
    }
    return null;
  }

  function cleanActiveSquareObsIds() {
    app.activeSquareObsIds = app.activeSquareObsIds.filter(function (obsId) {
      return !!findDatumByObsId(obsId);
    });
    while (app.activeSquareObsIds.length > getConfiguredMaxSquares()) {
      app.activeSquareObsIds.shift();
    }
  }

  function rememberSquareDatum(datum) {
    if (!datum || !datum.obs_id) return;
    const existingIndex = app.activeSquareObsIds.indexOf(datum.obs_id);
    if (existingIndex >= 0) {
      app.activeSquareObsIds.splice(existingIndex, 1);
    }
    app.activeSquareObsIds.push(datum.obs_id);
    cleanActiveSquareObsIds();
    renderDiagnosticSquares();
  }

  function getVisibleSquareData() {
    cleanActiveSquareObsIds();
    return app.activeSquareObsIds.map(function (obsId) {
      return findDatumByObsId(obsId);
    }).filter(function (d) {
      return !!d;
    });
  }

  function getSquareSpec(datum, referenceValue) {
    const pointXPx = app.xScale(datum.x);
    const pointYPx = app.yScale(datum.y);
    const referenceYPx = app.yScale(referenceValue);
    let sidePx = Math.abs(pointYPx - referenceYPx);
    if (sidePx < 2) sidePx = 2;
    const squareX = datum.y >= referenceValue ? pointXPx - sidePx : pointXPx;
    const squareY = Math.min(pointYPx, referenceYPx);
    return {
      x: squareX,
      y: squareY,
      width: sidePx,
      height: sidePx
    };
  }

  function createSquareFamily(config) {
    if (!app.squaresLayer) return;
    const family = app.squaresLayer.append('g')
      .attr('class', config.groupClass)
      .style('pointer-events', 'none');

    family.selectAll('circle')
      .data(config.data)
      .enter()
      .append('circle')
      .attr('cx', function (d) { return app.xScale(d.x); })
      .attr('cy', function (d) { return app.yScale(config.referenceAccessor(d)); })
      .attr('r', 0)
      .style('fill', config.anchorFill)
      .style('stroke', config.anchorStroke)
      .style('stroke-width', 1.5)
      .style('opacity', 0.9)
      .transition()
      .duration(180)
      .attr('r', 2.5);

    family.selectAll('rect')
      .data(config.data)
      .enter()
      .append('rect')
      .attr('class', config.squareClass)
      .attr('x', function (d) { return app.xScale(d.x); })
      .attr('y', function (d) { return app.yScale(config.referenceAccessor(d)); })
      .attr('width', 0)
      .attr('height', 0)
      .style('fill', config.fill)
      .style('stroke', config.stroke)
      .style('stroke-width', 2)
      .style('opacity', 0)
      .transition()
      .duration(250)
      .ease(d3.easeCubicOut)
      .attr('x', function (d) { return getSquareSpec(d, config.referenceAccessor(d)).x; })
      .attr('y', function (d) { return getSquareSpec(d, config.referenceAccessor(d)).y; })
      .attr('width', function (d) { return getSquareSpec(d, config.referenceAccessor(d)).width; })
      .attr('height', function (d) { return getSquareSpec(d, config.referenceAccessor(d)).height; })
      .style('opacity', config.opacity);
  }

  function renderDiagnosticSquares() {
    if (!app.squaresLayer) return;
    app.squaresLayer.selectAll('*').remove();
    const showResidualBoxes = d3.select('#checkBoxResidualBoxes').property('checked');
    const showSSEBoxes = d3.select('#checkBoxSSE_Boxes').property('checked');
    const hasModel = window.new_data.length > 2 && window.stats && isFinite(window.stats.slope) && window.stats.y_stats;
    if (!hasModel || (!showResidualBoxes && !showSSEBoxes) || window.new_data.sim) {
      return;
    }
    const visibleData = getVisibleSquareData();
    if (!visibleData.length) return;

    if (showResidualBoxes) {
      createSquareFamily({
        data: visibleData.filter(function (d) { return isFinite(d.yhat); }),
        referenceAccessor: function (d) { return d.yhat; },
        groupClass: 'residual-squares-group',
        squareClass: 'residuals_box_line',
        fill: 'rgba(255, 152, 0, 0.16)',
        stroke: '#ff9800',
        opacity: 0.8,
        anchorFill: '#9e9e9e',
        anchorStroke: '#616161'
      });
    }

    if (showSSEBoxes) {
      createSquareFamily({
        data: visibleData,
        referenceAccessor: function () { return window.stats.y_stats.mean; },
        groupClass: 'sse-squares-group',
        squareClass: 'sse_box_line',
        fill: 'rgba(63, 81, 181, 0.12)',
        stroke: '#3f51b5',
        opacity: 0.8,
        anchorFill: '#9e9e9e',
        anchorStroke: '#616161'
      });
    }
  }

  function buildSampleTraceFromCurrentSelection() {
    const sampledPoints = getOrderedData(false);
    if (sampledPoints.length < 2) return null;

    let xMean = 0;
    let yMean = 0;
    let term1 = 0;
    let term2 = 0;

    sampledPoints.forEach(function (d) {
      xMean += d.x;
      yMean += d.y;
    });

    xMean /= sampledPoints.length;
    yMean /= sampledPoints.length;

    sampledPoints.forEach(function (d) {
      const xr = d.x - xMean;
      const yr = d.y - yMean;
      term1 += xr * yr;
      term2 += xr * xr;
    });

    if (!isFinite(term2) || term2 === 0) return null;

    const slope = term1 / term2;
    const intercept = yMean - slope * xMean;

    return {
      intercept: intercept,
      slope: slope,
      lineData: sampledPoints.map(function (d) {
        return {
          x: d.x,
          yhat: intercept + d.x * slope
        };
      })
    };
  }

  function drawPersistentSampleTraces(svg) {
    if (!svg || !app.sampleTraces.length) return;

    const regressionTraceLine = d3.line()
      .x(function (d) { return app.xScale(d.x); })
      .y(function (d) { return app.yScale(d.yhat); });

    svg.append('g')
      .attr('class', 'sample-traces-layer')
      .selectAll('path')
      .data(app.sampleTraces)
      .enter()
      .append('path')
      .attr('class', 'regression_line_sim')
      .style('fill', 'none')
      .style('stroke', '#7f8c8d')
      .style('stroke-width', 2)
      .style('opacity', 0.4)
      .attr('d', function (trace) {
        return regressionTraceLine(trace.lineData);
      });
  }

  function closeConfigPanel() {
    d3.select('#regvis-config-overlay').remove();
    d3.select('#regvis-config-panel').remove();
  }

  function syncConfigPanelValues() {
    const maxSquaresSelect = document.getElementById('config_max_squares_select');
    const sampleRange = document.getElementById('config_sample_percent_range');
    const sampleNumber = document.getElementById('config_sample_percent_number');
    const pointRange = document.getElementById('config_point_radius_range');
    const pointNumber = document.getElementById('config_point_radius_number');

    if (maxSquaresSelect) {
      maxSquaresSelect.value = app.config.maxSquares === 'all' ? 'all' : String(app.config.maxSquares);
    }
    if (sampleRange) sampleRange.value = app.config.samplePercent;
    if (sampleNumber) sampleNumber.value = app.config.samplePercent;
    if (pointRange) pointRange.value = app.config.pointRadius;
    if (pointNumber) pointNumber.value = app.config.pointRadius;
  }

  function openConfigPanel() {
    closeConfigPanel();

    d3.select('body')
      .append('div')
      .attr('id', 'regvis-config-overlay')
      .style('position', 'fixed')
      .style('inset', '0')
      .style('background', 'rgba(15, 23, 42, 0.28)')
      .style('backdrop-filter', 'blur(2px)')
      .style('z-index', '9998')
      .on('click', function () {
        closeConfigPanel();
      });

    const panel = d3.select('body')
      .append('div')
      .attr('id', 'regvis-config-panel')
      .style('position', 'fixed')
      .style('top', '50%')
      .style('left', '50%')
      .style('transform', 'translate(-50%, -50%)')
      .style('width', '360px')
      .style('max-width', '92vw')
      .style('background', '#f8fafc')
      .style('border', '1px solid #cbd5e1')
      .style('border-radius', '16px')
      .style('box-shadow', '0 18px 48px rgba(15, 23, 42, 0.22)')
      .style('padding', '18px 18px 16px 18px')
      .style('z-index', '9999')
      .style('font-family', 'Segoe UI, Arial, sans-serif')
      .style('color', '#0f172a')
      .on('click', function () {
        d3.event.stopPropagation();
      });

    const header = panel.append('div')
      .style('display', 'flex')
      .style('align-items', 'center')
      .style('justify-content', 'space-between')
      .style('margin-bottom', '14px');

    header.append('div')
      .style('font-size', '18px')
      .style('font-weight', '700')
      .style('color', 'teal')
      .text('Visualization Settings');

    header.append('button')
      .attr('type', 'button')
      .text('X')
      .style('border', '1px solid #cbd5e1')
      .style('background', 'white')
	  .style('color', 'teal')
      .style('border-radius', '10px')
      .style('padding', '6px 10px')
      .style('cursor', 'pointer')
      .on('click', closeConfigPanel);

    panel.append('div')
      .style('font-size', '12px')
      .style('line-height', '1.45')
      .style('color', '#475569')
      .style('margin-bottom', '14px')
      .text('Adjust square visibility, future sampling percentage, and point size. Changes apply immediately where relevant.');

    function addSectionTitle(label) {
      panel.append('div')
        .style('font-size', '13px')
        .style('font-weight', '600')
        .style('margin', '12px 0 8px 0')
        .style('color', '#0f172a')
        .text(label);
    }

    function styleInput(selection) {
      selection
        .style('border', '1px solid #cbd5e1')
        .style('border-radius', '10px')
        .style('padding', '8px 10px')
        .style('font-size', '13px')
        .style('background', 'white')
        .style('color', '#0f172a');
    }

    addSectionTitle('Visible SSE and Total SS rectangles');
    const maxSquaresSelect = panel.append('select')
      .attr('id', 'config_max_squares_select')
      .style('width', '100%');
    styleInput(maxSquaresSelect);

    maxSquaresSelect.selectAll('option')
      .data([
        { value: '1', label: '1' },
        { value: '2', label: '2' },
        { value: '4', label: '4' },
        { value: '5', label: '5' },
        { value: 'all', label: 'All' }
      ])
      .enter()
      .append('option')
      .attr('value', function (d) { return d.value; })
      .text(function (d) { return d.label; });

    maxSquaresSelect.on('change', function () {
      app.config.maxSquares = this.value === 'all' ? 'all' : parseInt(this.value, 10);
      app.activeSquareObsIds = [];
      renderDiagnosticSquares();
      syncConfigPanelValues();
    });

    addSectionTitle('Sampling percentage');
    const sampleRow = panel.append('div')
      .style('display', 'grid')
      .style('grid-template-columns', '1fr 88px')
      .style('align-items', 'center')
      .style('gap', '10px');

    sampleRow.append('input')
      .attr('id', 'config_sample_percent_range')
      .attr('type', 'range')
      .attr('min', '10')
      .attr('max', '100')
      .attr('step', '1')
      .style('width', '100%')
      .on('input', function () {
        app.config.samplePercent = parseInt(this.value, 10);
        syncConfigPanelValues();
      });

    const sampleNumber = sampleRow.append('input')
      .attr('id', 'config_sample_percent_number')
      .attr('type', 'number')
      .attr('min', '10')
      .attr('max', '100')
      .attr('step', '1');
    styleInput(sampleNumber);
    sampleNumber.on('input', function () {
      let value = parseInt(this.value, 10);
      if (!isFinite(value)) return;
      if (value < 10) value = 10;
      if (value > 100) value = 100;
      app.config.samplePercent = value;
      syncConfigPanelValues();
    });

    addSectionTitle('Data-point size');
    const pointRow = panel.append('div')
      .style('display', 'grid')
      .style('grid-template-columns', '1fr 88px')
      .style('align-items', 'center')
      .style('gap', '10px');

    pointRow.append('input')
      .attr('id', 'config_point_radius_range')
      .attr('type', 'range')
      .attr('min', '3')
      .attr('max', '18')
      .attr('step', '1')
      .style('width', '100%')
      .on('input', function () {
        app.config.pointRadius = parseInt(this.value, 10);
        syncConfigPanelValues();
        applyCoordinatedHighlight();
      });

    const pointNumber = pointRow.append('input')
      .attr('id', 'config_point_radius_number')
      .attr('type', 'number')
      .attr('min', '3')
      .attr('max', '18')
      .attr('step', '1');
    styleInput(pointNumber);
    pointNumber.on('input', function () {
      let value = parseInt(this.value, 10);
      if (!isFinite(value)) return;
      if (value < 3) value = 3;
      if (value > 18) value = 18;
      app.config.pointRadius = value;
      syncConfigPanelValues();
      applyCoordinatedHighlight();
    });

    panel.append('div')
      .style('display', 'flex')
      .style('justify-content', 'flex-end')
      .style('margin-top', '18px')
      .append('button')
      .attr('type', 'button')
      .text('Done')
      .style('background', 'teal')
      .style('color', 'white')
      .style('border', 'none')
      .style('border-radius', '10px')
      .style('padding', '8px 14px')
      .style('cursor', 'pointer')
      .on('click', closeConfigPanel);

    syncConfigPanelValues();
  }


  function downloadSvgNode(svgNode, filename) {
    if (!svgNode) return;
    const svgBlob = new Blob([serializeSvgNode(svgNode)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function downloadAllPlots() {
    const mainSvg = d3.select('#new_data_plot_div svg').node();
    const residualSvg = d3.select('#residuals_plot_div svg').node();
    const qqSvg = d3.select('#norm_plot_div svg').node();

    if (!mainSvg || !residualSvg || !qqSvg) return;

    downloadSvgNode(mainSvg, 'main_plot.svg');
    setTimeout(function () {
      downloadSvgNode(residualSvg, 'residual_plot.svg');
    }, 80);
    setTimeout(function () {
      downloadSvgNode(qqSvg, 'qq_plot.svg');
    }, 160);
  }

  function setAxisInputs() {

    document.getElementById('input_minx').value = window.min_x_scale;
    document.getElementById('input_maxx').value = window.max_x_scale;
    document.getElementById('input_miny').value = window.min_y_scale;
    document.getElementById('input_maxy').value = window.max_y_scale;
  }

  function sortDataByX() {
    window.new_data.sort(function (a, b) {
      return d3.ascending(a.x, b.x);
    });
  }

  function assignObservationIds() {
    window.new_data.forEach(function (d) {
      if (d.obs_id === undefined || d.obs_id === null) {
        d.obs_id = 'obs_' + app.obsCounter;
        app.obsCounter += 1;
      }
      if (typeof d.sample !== 'boolean') d.sample = true;
    });
  }

  function isHovered(d) {
    return app.hoveredObsId !== null && d && d.obs_id === app.hoveredObsId;
  }

  function baseStrokeColor(d) {
    return d.sample ? 'yellow' : 'darkgray';
  }

  function applyCoordinatedHighlight() {
    if (app.plot) {
      app.plot.selectAll('.main-point')
        .attr('r', function (d) { return isHovered(d) ? app.config.pointRadius + 3 : app.config.pointRadius; })
        .style('stroke', function (d) { return isHovered(d) ? '#00bcd4' : baseStrokeColor(d); })
        .style('stroke-width', function (d) { return isHovered(d) ? 5 : 3; })
        .style('opacity', function (d) { return app.hoveredObsId && !isHovered(d) ? 0.35 : 1; });
    }

    if (app.residualPlot) {
      app.residualPlot.selectAll('.residual-point')
        .attr('r', function (d) { return isHovered(d) ? 8 : 5; })
        .style('stroke', function (d) { return isHovered(d) ? '#00bcd4' : 'yellow'; })
        .style('stroke-width', function (d) { return isHovered(d) ? 4 : 2; })
        .style('opacity', function (d) { return app.hoveredObsId && !isHovered(d) ? 0.25 : 1; });
    }

    if (app.qqPlot) {
      app.qqPlot.selectAll('.qq-point')
        .attr('r', function (d) { return isHovered(d) ? 8 : 5; })
        .style('stroke', function (d) { return isHovered(d) ? '#00bcd4' : 'yellow'; })
        .style('stroke-width', function (d) { return isHovered(d) ? 4 : 2; })
        .style('opacity', function (d) { return app.hoveredObsId && !isHovered(d) ? 0.25 : 1; });
    }
  }

  function setHoveredObservation(d) {
    app.hoveredObsId = d ? d.obs_id : null;
    applyCoordinatedHighlight();
  }

  function clearHoveredObservation() {
    app.hoveredObsId = null;
    applyCoordinatedHighlight();
  }

  function wirePointInteraction(selection, clickHandler) {
    selection
      .on('mouseover', function (d) {
        d3.event.stopPropagation();
        setHoveredObservation(d);
        rememberSquareDatum(d);
      })
      .on('mouseout', function () {
        clearHoveredObservation();
      })
      .on('click', function (d) {
        d3.event.stopPropagation();
        if (typeof clickHandler === 'function') clickHandler(d);
      });
  }

  function removePointAtDatum(datum) {
    window.new_data = window.new_data.filter(function (d) {
      return d.obs_id !== datum.obs_id;
    });
    app.activeSquareObsIds = app.activeSquareObsIds.filter(function (obsId) {
      return obsId !== datum.obs_id;
    });
    app.sampleTraces = [];
    window.new_data.sim = false;
    app.hoveredObsId = null;
    newdata_plot(false);
  }


function createMainPlot() {
  clearContainer('#new_data_plot_div');
  updateMainScales();
  app.mainRoot = d3.select('#new_data_plot_div')
    .append('svg')
    .attr('width', window.reg_svg_width + window.margin.left + window.margin.right)
    .attr('height', window.reg_svg_height + window.margin.top + window.margin.bottom)
    .style('cursor', 'crosshair');

  app.plot = app.mainRoot.append('g')
    .attr('transform', 'translate(' + window.margin.left + ',' + window.margin.top + ')');

  app.backgroundLayer = app.plot.append('g').attr('class', 'background-layer');
  app.axesLayer = app.plot.append('g').attr('class', 'axes-layer');
  app.squaresLayer = app.plot.append('g').attr('class', 'squares-layer').style('pointer-events', 'none');
  app.linesLayer = app.plot.append('g').attr('class', 'lines-layer').style('pointer-events', 'none');
  app.pointsLayer = app.plot.append('g').attr('class', 'points-layer');
  app.overlayLayer = app.plot.append('g').attr('class', 'overlay-layer').style('pointer-events', 'none');
  app.summaryLayer = app.plot.append('g').attr('class', 'summary-layer');
  app.controlsLayer = app.plot.append('g').attr('class', 'controls-layer');

  app.background = app.backgroundLayer.append('rect')
    .attr('class', 'plot-background')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', window.reg_svg_width)
    .attr('height', window.reg_svg_height)
    .attr('fill', 'transparent')
    .style('pointer-events', 'all')
    .on('mouseup', function () {
      const m = d3.mouse(this);
      const px = m[0];
      const py = m[1];
      if (px < 0 || px > window.reg_svg_width || py < 0 || py > window.reg_svg_height) return;

      window.new_data.push({
        x: app.xScale.invert(px),
        y: app.yScale.invert(py),
        sample: true,
        obs_id: 'obs_' + app.obsCounter
      });
      app.obsCounter += 1;
      app.sampleTraces = [];
      window.new_data.sim = false;
      sortDataByX();
      newdata_plot(false);
    });

  app.mainRoot
    .on('mousemove', function () {
      const m = d3.mouse(this);
      const px = m[0] - window.margin.left;
      const py = m[1] - window.margin.top;
      const inside = px >= 0 && px <= window.reg_svg_width && py >= 0 && py <= window.reg_svg_height;
      if (!inside) {
        app.hoverCircle.style('opacity', 0);
        app.hoverText.style('opacity', 0);
        return;
      }

      app.hoverCircle
        .attr('cx', px)
        .attr('cy', py)
        .style('opacity', 1);

      app.hoverText
        .html('(' + round(app.xScale.invert(px), 2) + ', ' + round(app.yScale.invert(py), 2) + ')')
        .attr('x', px - 45)
        .attr('y', py - 15)
        .style('opacity', 1);
    })
    .on('mouseout', function () {
      app.hoverCircle.style('opacity', 0);
      app.hoverText.style('opacity', 0);
    });

  app.hoverCircle = app.overlayLayer.append('circle')
    .attr('r', app.config.pointRadius + 0.5)
    .style('fill', 'none')
    .attr('stroke', 'black')
    .style('opacity', 0);

  app.hoverText = app.overlayLayer.append('text')
    .attr('text-anchor', 'left')
    .attr('alignment-baseline', 'middle')
    .style('opacity', 0);

  drawMainFrame();
  buildRegressionSummaryOverlay();

  const configControl = app.controlsLayer.append('foreignObject')
    .attr('x', window.reg_svg_width - 180)
    .attr('y', window.reg_svg_height + 20)
    .attr('width', 92)
    .attr('height', 34);

  configControl.append('xhtml:div')
    .style('display', 'flex')
    .style('justify-content', 'center')
    .style('align-items', 'center')
    .append('xhtml:button')
    .attr('type', 'button')
    .html('Config')
    .style('width', '86px')
    .style('padding', '6px 10px')
    .style('font-family', 'Segoe UI, Arial, sans-serif')
    .style('font-size', '12px')
    .style('font-weight', '600')
    .style('line-height', '1')
    .style('color', 'teal')
    .style('background', '#eef6f6')
    .style('border', '1px solid #7dcaca')
    .style('border-radius', '10px')
    .style('cursor', 'pointer')
    .style('box-shadow', '0 1px 4px rgba(15, 23, 42, 0.10)')
    .on('click', function () {
      d3.event.stopPropagation();
      openConfigPanel();
    });

  const downloadControl = app.controlsLayer.append('foreignObject')
    .attr('x', window.reg_svg_width - 80)
    .attr('y', window.reg_svg_height + 20)
    .attr('width', 92)
    .attr('height', 34);

  downloadControl.append('xhtml:div')
    .style('display', 'flex')
    .style('justify-content', 'center')
    .style('align-items', 'center')
    .append('xhtml:button')
    .attr('type', 'button')
    .html('Download')
    .style('width', '88px')
    .style('padding', '6px 10px')
    .style('font-family', 'Segoe UI, Arial, sans-serif')
    .style('font-size', '12px')
    .style('font-weight', '600')
    .style('line-height', '1')
    .style('color', '#0f172a')
    .style('background', '#f8fafc')
    .style('border', '1px solid #cbd5e1')
    .style('border-radius', '10px')
    .style('cursor', 'pointer')
    .style('box-shadow', '0 1px 4px rgba(15, 23, 42, 0.10)')
    .on('click', function () {
      d3.event.stopPropagation();
      downloadAllPlots();
    });
}

function drawMainFrame() {

    app.axesLayer.append('g')
      .attr('class', 'main-x-axis')
      .attr('transform', 'translate(0,' + window.reg_svg_height + ')')
      .call(d3.axisBottom(app.xScale));

    app.axesLayer.append('text')
      .attr('font-size', '15pt')
      .attr('font-family', 'sans-serif')
      .attr('x', window.reg_svg_width / 2)
      .attr('y', window.reg_svg_height + window.margin.bottom - 10)
      .text(window.x_axis_label);

    app.axesLayer.append('g')
      .attr('class', 'main-y-axis')
      .call(d3.axisLeft(app.yScale));

    app.axesLayer.append('text')
      .attr('font-size', '15pt')
      .attr('font-family', 'sans-serif')
      .attr('x', -window.reg_svg_height / 2)
      .attr('y', -30)
      .attr('transform', 'rotate(-90)')
      .style('text-anchor', 'middle')
      .text(window.y_axis_label);

    app.axesLayer.append('text')
      .attr('x', (window.reg_svg_width / 2) - 50)
      .attr('y', 10)
      .attr('font-size', '14pt')
      .attr('font-family', 'sans-serif')
      .style('fill', 'teal')
      .text('Data Points');
  }

  function buildRegressionSummaryOverlay() {
    app.summaryLayer.select('#regression_summary_group').remove();
    app.summaryLayer.select('#toggle_regression_summary_link').remove();

    const group = app.summaryLayer.append('g').attr('id', 'regression_summary_group');

    app.summaryBody = group
      .append('foreignObject')
      .attr('x', 10)
      .attr('y', 30)
      .attr('width', 240)
      .attr('height', 240)
      .attr('id', 'regression_summary_text')
      .style('display', app.summaryVisible ? 'block' : 'none')
      .append('xhtml:body')
      .style('margin', '0')
      .style('padding', '10px')
      .style('background', '#f9f9f9')
      .style('border', '1px solid #ccc')
      .style('border-radius', '8px')
      .style('font-family', 'sans-serif')
      .style('font-size', '12px')
      .style('line-height', '1.45');

    app.summaryToggle = app.summaryLayer.append('text')
      .attr('x', 10)
      .attr('y', 20)
      .attr('id', 'toggle_regression_summary_link')
      .style('cursor', 'pointer')
      .style('fill', '#007BFF')
      .style('text-decoration', 'underline')
      .style('font-size', '14px')
      .text(app.summaryVisible ? 'Hide Regression Summary' : 'Show Regression Summary')
      .on('click', function () {
        d3.event.stopPropagation();
        app.summaryVisible = !app.summaryVisible;
        app.summaryLayer.select('#regression_summary_text')
          .style('display', app.summaryVisible ? 'block' : 'none');
        d3.select(this).text(app.summaryVisible ? 'Hide Regression Summary' : 'Show Regression Summary');
      });

    group.on('click', function () {
      d3.event.stopPropagation();
    });
  }

  function updateRegressionSummary() {
    if (!app.summaryBody) return;

    if (!window.stats || !isFinite(window.stats.intercept) || !isFinite(window.stats.slope) || !isFinite(window.stats.r_squared)) {
      app.summaryBody.html('<div><strong>Regression Summary</strong><p>Add at least 3 data points to view the model summary.</p></div>');
      return;
    }

    const adjustedRSquared = 1 - (window.stats.sse / (window.stats.count - 2)) / (window.stats.total_ss / (window.stats.count - 1));
    const fStatistic = window.stats.r_squared / ((1 - window.stats.r_squared) / (window.stats.count - 2));

    app.summaryBody.html(
      '<div style="font-family: sans-serif; line-height: 1.3; font-size: 12px;">' +
        '<p><strong>Equation:</strong> ' + window.y_axis_label + '&#770; = ' + round(window.stats.intercept, 4) + ' + ' + round(window.stats.slope, 4) + ' ' + window.x_axis_label + '</p>' +
        '<ul style="list-style-type: disc; margin-left: 18px; padding-left: 0;">' +
          '<li><strong>Sample size:</strong> ' + window.stats.count + '</li>' +
          '<li><strong>Slope:</strong> ' + round(window.stats.slope, 4) + '</li>' +
          '<li><strong>Intercept:</strong> ' + round(window.stats.intercept, 4) + '</li>' +
          '<li><strong>Total SS:</strong> ' + round(window.stats.total_ss, 4) + '</li>' +
          '<li><strong>SSE:</strong> ' + round(window.stats.sse, 4) + '</li>' +
          '<li><strong>SSR:</strong> ' + round(window.stats.ssr, 4) + '</li>' +
          '<li><strong>R<sup>2</sup>:</strong> ' + round(window.stats.r_squared, 4) + '</li>' +
          '<li><strong>Adjusted R<sup>2</sup>:</strong> ' + round(adjustedRSquared, 4) + '</li>' +
          '<li><strong>F statistic:</strong> ' + round(fStatistic, 4) + '</li>' +
        '</ul>' +
      '</div>'
    );
  }

  function createResidualPlot() {
    clearContainer('#residuals_plot_div');

    app.residualWidth = Math.floor(window.innerWidth * residuals_plot_w_innerWidth);
    app.residualHeight = Math.floor(window.innerHeight * residuals_plot_h_innerHeight);
    app.residualXScale = d3.scaleLinear().domain([window.min_x_scale, window.max_x_scale]).range([0, app.residualWidth]);
    app.residualYScale = d3.scaleLinear().domain([-5, 5]).range([app.residualHeight, 0]);

    app.residualRoot = d3.select('#residuals_plot_div')
      .append('svg')
      .attr('width', app.residualWidth + window.margin.left + window.margin.right)
      .attr('height', app.residualHeight + window.margin.top + window.margin.bottom)
      .style('cursor', 'crosshair');

    app.residualPlot = app.residualRoot.append('g')
      .attr('transform', 'translate(' + window.margin.left + ',' + window.margin.top + ')');

    app.residualRoot
      .on('mousemove', function () {
        const m = d3.mouse(this);
        const px = m[0] - window.margin.left;
        const py = m[1] - window.margin.top;
        app.residualHoverCircle.attr('cx', px).attr('cy', py).style('opacity', 1);
        app.residualHoverText
          .html('(' + round(app.residualXScale.invert(px), 2) + ', ' + round(app.residualYScale.invert(py), 2) + ')')
          .attr('x', px - 45)
          .attr('y', py - 15)
          .style('opacity', 1);
      })
      .on('mouseout', function () {
        app.residualHoverCircle.style('opacity', 0);
        app.residualHoverText.style('opacity', 0);
      });

    app.residualHoverCircle = app.residualPlot.append('circle')
      .style('fill', 'none')
      .attr('stroke', 'black')
      .attr('r', 8.5)
      .style('opacity', 0);

    app.residualHoverText = app.residualPlot.append('text')
      .attr('text-anchor', 'left')
      .attr('alignment-baseline', 'middle')
      .style('opacity', 0);

    app.residualPlot.append('g')
      .attr('id', 'residuals_plot_xaxis')
      .attr('transform', 'translate(0,' + app.residualHeight + ')')
      .call(d3.axisBottom(app.residualXScale));

    app.residualPlot.append('text')
      .attr('font-size', '12pt')
      .attr('font-family', 'sans-serif')
      .attr('x', (app.residualWidth / 2) - 40)
      .attr('y', app.residualHeight + window.margin.bottom)
      .text('Fitted Value');

    app.residualPlot.append('g')
      .attr('id', 'residuals_plot_yaxis')
      .call(d3.axisLeft(app.residualYScale));

    app.residualPlot.append('text')
      .attr('font-size', '12pt')
      .attr('font-family', 'sans-serif')
      .attr('x', -app.residualHeight / 2)
      .attr('y', -30)
      .attr('transform', 'rotate(-90)')
      .style('text-anchor', 'middle')
      .text('Residual');

    app.residualPlot.append('text')
      .attr('x', (app.residualWidth / 2) - 100)
      .attr('y', window.margin.top)
      .text('Residuals vs. Fitted Values')
      .attr('font-size', '14pt')
      .attr('font-family', 'sans-serif')
      .style('fill', 'teal');
  }

  function updateResidualPlot() {
    if (!app.residualPlot) return;

    app.residualPlot.selectAll('#residuals_plot_residuals').remove();
    app.residualPlot.selectAll('#residuals_vs_fitted_line').remove();

    app.residualWidth = Math.floor(window.innerWidth * residuals_plot_w_innerWidth);
    app.residualHeight = Math.floor(window.innerHeight * residuals_plot_h_innerHeight);
    app.residualXScale = d3.scaleLinear().domain([window.min_x_scale, window.max_x_scale]).range([0, app.residualWidth]);

    const maxError = Math.max(5, Math.abs(Math.floor(window.stats.min_error || 0)), Math.floor(window.stats.max_error || 0));
    app.residualYScale = d3.scaleLinear().domain([-maxError-5, maxError+5]).range([app.residualHeight, 0]);

    app.residualPlot.select('#residuals_plot_xaxis')
      .attr('transform', 'translate(0,' + app.residualHeight + ')')
      .call(d3.axisBottom(app.residualXScale));

    app.residualPlot.select('#residuals_plot_yaxis')
      .call(d3.axisLeft(app.residualYScale));

    const points = app.residualPlot.append('g')
      .attr('id', 'residuals_plot_residuals')
      .selectAll('circle')
      .data(window.new_data)
      .enter()
      .append('circle')
      .attr('class', 'residual-point')
      .attr('cx', function (d) { return app.residualXScale(d.x); })
      .attr('cy', function (d) { return app.residualYScale(d.y - d.yhat); })
      .attr('r', 5)
      .style('fill', 'black')
      .style('stroke', 'yellow')
      .style('stroke-width', 2)
      .style('cursor', 'pointer');

    wirePointInteraction(points, null);

    const lineData = [
      { x: window.min_x_scale, y: 0 },
      { x: window.max_x_scale, y: 0 }
    ];

    const line = d3.line()
      .x(function (d) { return app.residualXScale(d.x); })
      .y(function (d) { return app.residualYScale(d.y); });

    app.residualPlot.append('path')
      .attr('id', 'residuals_vs_fitted_line')
      .datum(lineData)
      .attr('class', 'line')
      .attr('d', line);

    applyCoordinatedHighlight();
  }

  function createQQPlot() {
    clearContainer('#norm_plot_div');

    app.qqWidth = Math.floor(window.innerWidth * norm_plot_w_innerWidth);
    app.qqHeight = Math.floor(window.innerHeight * norm_plot_h_innerHeight);
    app.qqXScale = d3.scaleLinear().domain([-3, 3]).range([0, app.qqWidth]);
    app.qqYScale = d3.scaleLinear().domain([-3, 3]).range([app.qqHeight, 0]);

    app.qqRoot = d3.select('#norm_plot_div')
      .append('svg')
      .attr('width', app.qqWidth + window.margin.left + window.margin.right)
      .attr('height', app.qqHeight + window.margin.top + window.margin.bottom)
      .style('cursor', 'crosshair');

    app.qqPlot = app.qqRoot.append('g')
      .attr('transform', 'translate(' + window.margin.left + ',' + window.margin.top + ')');

    app.qqRoot
      .on('mousemove', function () {
        const m = d3.mouse(this);
        const px = m[0] - window.margin.left;
        const py = m[1] - window.margin.top;
        app.qqHoverCircle.attr('cx', px).attr('cy', py).style('opacity', 1);
        app.qqHoverText
          .html('(' + round(app.qqXScale.invert(px), 2) + ', ' + round(app.qqYScale.invert(py), 2) + ')')
          .attr('x', px - 45)
          .attr('y', py - 15)
          .style('opacity', 1);
      })
      .on('mouseout', function () {
        app.qqHoverCircle.style('opacity', 0);
        app.qqHoverText.style('opacity', 0);
      });

    app.qqHoverCircle = app.qqPlot.append('circle')
      .style('fill', 'none')
      .attr('stroke', 'black')
      .attr('r', 8.5)
      .style('opacity', 0);

    app.qqHoverText = app.qqPlot.append('text')
      .attr('text-anchor', 'left')
      .attr('alignment-baseline', 'middle')
      .style('opacity', 0);

    app.qqPlot.append('g')
      .attr('id', 'norm_plot_xaxis')
      .attr('transform', 'translate(0,' + app.qqHeight + ')')
      .call(d3.axisBottom(app.qqXScale));

    app.qqPlot.append('text')
      .attr('font-size', '12pt')
      .attr('font-family', 'sans-serif')
      .attr('x', (app.qqWidth / 2) - 80)
      .attr('y', app.qqHeight + window.margin.bottom)
      .text('Normalized Residuals');

    app.qqPlot.append('g')
      .attr('id', 'norm_plot_yaxis')
      .call(d3.axisLeft(app.qqYScale));

    app.qqPlot.append('text')
      .attr('font-size', '12pt')
      .attr('font-family', 'sans-serif')
      .attr('x', -app.qqHeight / 2)
      .attr('y', -30)
      .attr('transform', 'rotate(-90)')
      .style('text-anchor', 'middle')
      .text('Expected Value');

    app.qqPlot.append('text')
      .attr('x', (app.qqWidth / 2) - 50)
      .attr('y', 10)
      .text('Normal QQ Plot')
      .attr('font-size', '14pt')
      .attr('font-family', 'sans-serif')
      .style('fill', 'teal');
  }

  function updateQQPlot() {
    if (!app.qqPlot) return;

    app.qqPlot.selectAll('#residuals_normality_plot_residuals').remove();
    app.qqPlot.selectAll('#residuals_normality_line').remove();

    app.qqPlot.select('#norm_plot_xaxis')
      .attr('transform', 'translate(0,' + app.qqHeight + ')')
      .call(d3.axisBottom(app.qqXScale));

    app.qqPlot.select('#norm_plot_yaxis')
      .call(d3.axisLeft(app.qqYScale));

    const sortedByResidual = window.new_data.slice().sort(function (a, b) {
      return (a.y - a.yhat) - (b.y - b.yhat);
    });

    const points = app.qqPlot.append('g')
      .attr('id', 'residuals_normality_plot_residuals')
      .selectAll('circle')
      .data(sortedByResidual)
      .enter()
      .append('circle')
      .attr('class', 'qq-point')
      .attr('cx', function (d) {
        const residualZ = ((d.y - d.yhat) - window.stats.residuals_mean) / Math.sqrt(window.stats.residuals_var);
        return app.qqXScale(residualZ);
      })
      .attr('cy', function (d, i) {
        const f = ((i + 1) - 0.5) / window.stats.count;
        return app.qqYScale(ltqnorm(f));
      })
      .attr('r', 5)
      .style('fill', 'black')
      .style('stroke', 'yellow')
      .style('stroke-width', 2)
      .style('cursor', 'pointer');

    wirePointInteraction(points, null);

    const lineData = [];
    for (let i = -3; i <= 3; i += 1) {
      lineData.push({ x: i, y: i });
    }

    const line = d3.line()
      .x(function (d) { return app.qqXScale(d.x); })
      .y(function (d) { return app.qqYScale(d.y); });

    app.qqPlot.append('path')
      .attr('id', 'residuals_normality_line')
      .datum(lineData)
      .attr('class', 'line')
      .attr('d', line);

    applyCoordinatedHighlight();
  }


function drawDataPoints() {
  app.pointsLayer.selectAll('*').remove();
  const points = app.pointsLayer.selectAll('circle')
    .data(window.new_data)
    .enter()
    .append('circle')
    .attr('class', 'main-point')
    .attr('cx', function (d) { return app.xScale(d.x); })
    .attr('cy', function (d) { return app.yScale(d.y); })
    .attr('r', app.config.pointRadius)
    .style('fill', 'black')
    .style('stroke', function (d) { return baseStrokeColor(d); })
    .style('stroke-width', 3)
    .style('cursor', 'pointer');
  wirePointInteraction(points, removePointAtDatum);
  applyCoordinatedHighlight();
}

function drawResidualBoxes() {

    renderDiagnosticSquares();
  }

function drawSSEBoxes() {
    renderDiagnosticSquares();
  }

function add_regression_line(svg, sim) {
  const regressionLine = d3.line()
    .x(function (d) { return app.xScale(d.x); })
    .y(function (d) { return app.yScale(d.yhat); });

  svg.append('g')
    .selectAll('dot')
    .data([window.stats])
    .enter()
    .append('circle')
    .attr('cx', function (s) { return app.xScale(s.x_stats.mean); })
    .attr('cy', function (s) { return app.yScale(s.y_stats.mean); })
    .attr('r', 6)
    .style('fill', 'red')
    .style('stroke', 'black')
    .style('opacity', 0.2);

  const lineData = getOrderedData(true).map(function (d) {
    return { x: d.x, yhat: window.stats.intercept + d.x * window.stats.slope };
  });

  svg.append('path')
    .datum(lineData)
    .attr('class', 'regression_line')
    .attr('d', regressionLine);
}
window.add_regression_line = add_regression_line;

function add_ymean_line(svg, sim) {
  const ymeanLine = d3.line()
    .x(function (d) { return app.xScale(d.x); })
    .y(function () { return app.yScale(window.stats.y_stats.mean); });

  svg.append('g')
    .selectAll('dot')
    .data([window.stats])
    .enter()
    .append('circle')
    .attr('cx', function (s) { return app.xScale(s.x_stats.mean); })
    .attr('cy', function (s) { return app.yScale(s.y_stats.mean); })
    .attr('r', 6)
    .style('fill', 'red')
    .style('stroke', 'black')
    .style('opacity', 0.2);

  const lineData = getOrderedData(true).map(function (d) {
    return { x: d.x };
  });

  svg.append('path')
    .datum(lineData)
    .attr('class', 'ymean_line')
    .attr('d', ymeanLine);
}
window.add_ymean_line = add_ymean_line;

function add_interval_lines(svg, data, localStats, ci, pi) {
  const orderedAllData = window.new_data.slice().sort(function (a, b) {
    return d3.ascending(a.x, b.x);
  });

  const ciData = orderedAllData.filter(function (d) {
    return isFinite(d.yhat_ci_upper) && isFinite(d.yhat_ci_lower);
  });

  const piData = orderedAllData.filter(function (d) {
    return isFinite(d.yhat_pi_upper) && isFinite(d.yhat_pi_lower);
  });

  regression_ci_upper_line
    .x(function (d) { return app.xScale(d.x); })
    .y(function (d) { return app.yScale(d.yhat_ci_upper); });

  regression_ci_lower_line
    .x(function (d) { return app.xScale(d.x); })
    .y(function (d) { return app.yScale(d.yhat_ci_lower); });

  regression_pi_upper_line
    .x(function (d) { return app.xScale(d.x); })
    .y(function (d) { return app.yScale(d.yhat_pi_upper); });

  regression_pi_lower_line
    .x(function (d) { return app.xScale(d.x); })
    .y(function (d) { return app.yScale(d.yhat_pi_lower); });

  if (ci && ciData.length) {
    svg.append('path')
      .datum(ciData)
      .attr('class', 'ci_line')
      .attr('d', regression_ci_upper_line)
      .attr('fill', 'none')
      .attr('stroke', '#1f77ff')
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round');

    svg.append('path')
      .datum(ciData)
      .attr('class', 'ci_line')
      .attr('d', regression_ci_lower_line)
      .attr('fill', 'none')
      .attr('stroke', '#1f77ff')
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round');
  }

  if (pi && piData.length) {
    svg.append('path')
      .datum(piData)
      .attr('class', 'pi_line')
      .attr('d', regression_pi_upper_line)
      .attr('fill', 'none')
      .attr('stroke', '#111111')
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round');

    svg.append('path')
      .datum(piData)
      .attr('class', 'pi_line')
      .attr('d', regression_pi_lower_line)
      .attr('fill', 'none')
      .attr('stroke', '#111111')
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round');
  }
}

function add_interval_lines1(svg, data, localStats, ci, pi) {
  const orderedAllData = getOrderedData(true);
  const ciData = orderedAllData.filter(function (d) {
    return isFinite(d.yhat_ci_upper) && isFinite(d.yhat_ci_lower);
  });
  const piData = orderedAllData.filter(function (d) {
    return isFinite(d.yhat_pi_upper) && isFinite(d.yhat_pi_lower);
  });

  regression_ci_upper_line
    .x(function (d) { return app.xScale(d.x); })
    .y(function (d) { return app.yScale(d.yhat_ci_upper); });
  regression_ci_lower_line
    .x(function (d) { return app.xScale(d.x); })
    .y(function (d) { return app.yScale(d.yhat_ci_lower); });
  regression_pi_upper_line
    .x(function (d) { return app.xScale(d.x); })
    .y(function (d) { return app.yScale(d.yhat_pi_upper); });
  regression_pi_lower_line
    .x(function (d) { return app.xScale(d.x); })
    .y(function (d) { return app.yScale(d.yhat_pi_lower); });

  if (ci && ciData.length) {
    svg.append('path')
      .datum(ciData)
      .attr('class', 'ci_line')
      .attr('d', regression_ci_upper_line)
      .attr('stroke', 'blue');
    svg.append('path')
      .datum(ciData)
      .attr('class', 'ci_line')
      .attr('d', regression_ci_lower_line);
  }

  if (pi && piData.length) {
    svg.append('path')
      .datum(piData)
      .attr('class', 'pi_line')
      .attr('d', regression_pi_upper_line);
    svg.append('path')
      .datum(piData)
      .attr('class', 'pi_line')
      .attr('d', regression_pi_lower_line);
  }
}
window.add_interval_lines = add_interval_lines;



function newdata_plot(sim) {
  sim = sim === undefined ? false : sim;

  assignObservationIds();
  createMainPlot();
  drawDataPoints();
  window.new_data.sim = !!sim;

  if (window.new_data.length > 2) {
    window.stats = regress(window.new_data);
    updateRegressionSummary();

    drawPersistentSampleTraces(app.linesLayer);

    if (d3.select('#checkBoxRegressionLine').property('checked')) {
      add_regression_line(app.linesLayer, false);
    }

    if (d3.select('#checkBoxSSE_Boxes').property('checked') && !sim) {
      add_ymean_line(app.linesLayer, false);
    }

    if (d3.select('#checkBoxCI_Lines').property('checked') || d3.select('#checkBoxPI_Lines').property('checked')) {
      add_interval_lines(
        app.linesLayer,
        window.new_data,
        window.stats,
        d3.select('#checkBoxCI_Lines').property('checked'),
        d3.select('#checkBoxPI_Lines').property('checked')
      );
    }

    if (
      d3.select('#checkBoxRegressionLine').property('checked') ||
      d3.select('#checkBoxCI_Lines').property('checked') ||
      d3.select('#checkBoxPI_Lines').property('checked') ||
      d3.select('#checkBoxResidualBoxes').property('checked') ||
      d3.select('#checkBoxSSE_Boxes').property('checked')
    ) {
      updateResidualPlot();
      updateQQPlot();
    } else {
      createResidualPlot();
      createQQPlot();
    }

    renderDiagnosticSquares();
  } else {
    updateRegressionSummary();
    createResidualPlot();
    createQQPlot();
    renderDiagnosticSquares();
  }

  applyCoordinatedHighlight();
}
window.newdata_plot = newdata_plot;


  function rescale_plot() {
    if (event.key !== 'Enter') return;

    window.min_x_scale = parseInt(document.getElementById('input_minx').value, 10);
    window.max_x_scale = parseInt(document.getElementById('input_maxx').value, 10);
    window.min_y_scale = parseInt(document.getElementById('input_miny').value, 10);
    window.max_y_scale = parseInt(document.getElementById('input_maxy').value, 10);

    if (window.max_x_scale <= window.min_x_scale) {
      alert('Max X cannot be less than or equal to Min X');
      return;
    }
    if (window.max_y_scale <= window.min_y_scale) {
      alert('Max Y cannot be less than or equal to Min Y');
      return;
    }

    updateMainScales();
    createResidualPlot();
    createQQPlot();
    newdata_plot(false);
  }
  window.rescale_plot = rescale_plot;


function simulate() {
  if (window.new_data.length < 10) {
    alert('Please create at least 10 data points to simulate.');
    return;
  }

  window.new_data.forEach(function (d) { d.sample = false; });
  const sampleCount = Math.max(1, Math.floor(window.new_data.length * (app.config.samplePercent / 100)));
  const indices = _.sample(Array.from({ length: window.new_data.length }, function (_, i) { return i; }), sampleCount);
  indices.forEach(function (i) {
    window.new_data[i].sample = true;
  });

  const trace = buildSampleTraceFromCurrentSelection();
  if (trace) {
    app.sampleTraces.push(trace);
  }

  app.activeSquareObsIds = [];
  newdata_plot(true);
}
window.simulate = simulate;

function regress(data) {
  if (
    'count' in window.stats &&
    window.stats.count === data.length &&
    window.stats.pi_alpha === window.pi_alpha &&
    window.stats.ci_alpha === window.ci_alpha &&
    data.sim === false
  ) {
    return window.stats;
  }

  let xMean = 0;
  let yMean = 0;
  let term1 = 0;
  let term2 = 0;
  let count = 0;
  let minY = 1e10000;
  let minX = 1e10000;
  let maxX = -1e10000;
  let maxY = -1e10000;

  data.forEach(function (d) {
    if (d.y < minY) minY = d.y;
    if (d.y > maxY) maxY = d.y;
    if (d.x < minX) minX = d.x;
    if (d.x > maxX) maxX = d.x;
    xMean += d.x;
    yMean += d.y;
    count += 1;
  });

  if (count < 2) {
    window.stats = {};
    return window.stats;
  }

  xMean /= count;
  yMean /= count;

  let totalSS = 0;
  data.forEach(function (d) {
    const xr = d.x - xMean;
    const yr = d.y - yMean;
    totalSS += yr * yr;
    term1 += xr * yr;
    term2 += xr * xr;
  });

  const slope = term1 / term2;
  const intercept = yMean - slope * xMean;

  window.stats.pi_alpha = window.pi_alpha;
  window.stats.ci_alpha = window.ci_alpha;
  window.stats.count = count;
  window.stats.intercept = intercept;
  window.stats.slope = slope;
  window.stats.x_stats = { mean: xMean, min: minX, max: maxX, count: count };
  window.stats.y_stats = { mean: yMean, min: minY, max: maxY, count: count };

  let sse = 0;
  let xSum = 0;
  let xSquaredSum = 0;
  let minError = maxY;
  let maxError = 0;
  let residualsMean = 0;

  data.forEach(function (d) {
    d.yhat = intercept + d.x * slope;
    const absError = Math.abs(d.yhat - d.y);
    if (absError < minError) minError = absError;
    if (absError > maxError) maxError = absError;
    sse += Math.pow(d.y - d.yhat, 2);
    xSquaredSum += Math.pow(d.x, 2);
    residualsMean += (d.yhat - d.y);
    xSum += d.x;
  });

  residualsMean /= count;
  window.stats.min_error = minError;
  window.stats.max_error = maxError;

  const ciAlphaLevel = (100.0 - (100 - window.ci_alpha) / 2.0) / 100.0;
  const tAlphaBy2Ci = invCumulativeProbabilityTDistribution(ciAlphaLevel, window.stats.x_stats.count - 2);
  const piAlphaLevel = (100.0 - (100 - window.pi_alpha) / 2.0) / 100.0;
  const tAlphaBy2Pi = invCumulativeProbabilityTDistribution(piAlphaLevel, window.stats.x_stats.count - 2);
  const mse = sse / (window.stats.x_stats.count - 2);
  const sxx = xSquaredSum - (Math.pow(xSum, 2) / window.stats.x_stats.count);

  let residualsVar = 0;
  data.forEach(function (d) {
    residualsVar += Math.pow((d.y - d.yhat) - residualsMean, 2);
    const yhatSeCi = Math.sqrt(mse * ((1 / window.stats.x_stats.count) + (Math.pow(d.x - window.stats.x_stats.mean, 2) / sxx)));
    const yhatSePi = Math.sqrt(mse * (1 + (1 / window.stats.x_stats.count) + (Math.pow(d.x - window.stats.x_stats.mean, 2) / sxx)));
    d.yhat_ci_upper = d.yhat + tAlphaBy2Ci * yhatSeCi;
    d.yhat_ci_lower = d.yhat - tAlphaBy2Ci * yhatSeCi;
    d.yhat_pi_upper = d.yhat + tAlphaBy2Pi * yhatSePi;
    d.yhat_pi_lower = d.yhat - tAlphaBy2Pi * yhatSePi;
  });

  residualsVar /= (count - 1);
  window.stats.residuals_var = residualsVar;
  window.stats.residuals_mean = residualsMean;
  window.stats.r_squared = 1 - (sse / totalSS);
  window.stats.sse = sse;
  window.stats.total_ss = totalSS;
  window.stats.ssr = totalSS - sse;
  window.stats.ci_pi_data = getOrderedData(true);
  return window.stats;
}
window.regress = regress;


  function ConvertToCSV(objArray) {
    const array = typeof objArray !== 'object' ? JSON.parse(objArray) : objArray;
    if (!array || !array.length) return '';
    let str = '';
    const header = Object.keys(array[0]).toString();
    for (let i = 0; i < array.length; i += 1) {
      let line = '';
      for (const index in array[i]) {
        if (line !== '') line += ',';
        line += array[i][index];
      }
      str += line + '\r\n';
    }
    return header + '\r\n' + str;
  }
  window.ConvertToCSV = ConvertToCSV;

  function loadFile() {
    const input = document.getElementById('upload-button') || document.querySelector('input[type=file]');
    const file = input && input.files ? input.files[0] : null;
    if (!file) return;

    app.reader.onload = function (e) {
      parseFile(e.target.result);
    };
    app.reader.readAsText(file);
  }
  window.loadFile = loadFile;

  function parseFile(text) {
    const raw = d3.csvParse(text);
    const columns = raw.columns;
    if (columns.length < 2) {
      alert('File must contain at least 2 columns.');
      return;
    }

    const xKey = columns[0];
    const yKey = columns[1];
    window.x_axis_label = xKey;
    window.y_axis_label = yKey;

    window.new_data = raw.map(function (d) {
      return { x: +d[xKey], y: +d[yKey], sample: true, obs_id: 'obs_' + app.obsCounter++ };
    }).filter(function (d) {
      return !isNaN(d.x) && !isNaN(d.y);
    });

    sortDataByX();
    window.new_data.sim = false;
    window.stats = {};
    app.activeSquareObsIds = [];
    app.sampleTraces = [];
    regress(window.new_data);

    window.min_x_scale = window.stats.x_stats.min - 1;
    window.max_x_scale = window.stats.x_stats.max + 1;
    window.min_y_scale = window.stats.y_stats.min - 1;
    window.max_y_scale = window.stats.y_stats.max + 1;

    setAxisInputs();
    updateMainScales();
    createResidualPlot();
    createQQPlot();
    newdata_plot(false);
  }
  window.parseFile = parseFile;

  function upload_data() {
    reset_plots(false);
    loadFile();
  }
  window.upload_data = upload_data;

  function reset_plots(clearInputs) {
    if (clearInputs === undefined) clearInputs = true;

    window.x_axis_label = 'x';
    window.y_axis_label = 'y';
    window.new_data = [];
    window.stats = {};
    app.summaryVisible = false;
    app.hoveredObsId = null;
    app.activeSquareObsIds = [];
    app.sampleTraces = [];

    if (clearInputs) {
      window.min_x_scale = 50;
      window.max_x_scale = 100;
      window.min_y_scale = 50;
      window.max_y_scale = 100;
      setAxisInputs();
    }

    updateMainScales();
    createResidualPlot();
    createQQPlot();
    newdata_plot(false);
  }
  window.reset_plots = reset_plots;

  function updateWindow() {
    window.reg_svg_width = Math.floor(window.innerHeight * reg_svg_w_innerWidth);
    window.reg_svg_height = Math.floor(window.innerHeight * reg_svg_h_innerHeight);
    updateMainScales();
    createResidualPlot();
    createQQPlot();
    newdata_plot(false);
  }
  window.updateWindow = updateWindow;
  d3.select(window).on('resize.updatesvg', updateWindow);

  d3.select('#ci_alpha_slider').on('input', function () {
    window.ci_alpha = parseInt(this.value, 10);
    document.getElementById('ci_alpha_slider_label').innerHTML = 'CI alpha ' + window.ci_alpha + '%';
    newdata_plot(false);
  });

  d3.select('#pi_alpha_slider').on('input', function () {
    window.pi_alpha = parseInt(this.value, 10);
    document.getElementById('pi_alpha_slider_label').innerHTML = 'PI alpha ' + window.pi_alpha + '%';
    newdata_plot(false);
  });

  d3.select('#download-button').on('click', function () {
    const a = document.createElement('a');
    const file = new Blob([ConvertToCSV(window.new_data)], { type: 'text/plain' });
    a.href = URL.createObjectURL(file);
    a.download = 'data.csv';
    a.click();
  });

  d3.select('#simulate-button').on('click', function () {
    simulate();
  });

  d3.select('#reset-button').on('click', function () {
    reset_plots(true);
  });

  function LogGamma(Z) {
    const S = 1 + 76.18009173 / Z - 86.50532033 / (Z + 1) + 24.01409822 / (Z + 2) - 1.231739516 / (Z + 3) + 0.00120858003 / (Z + 4) - 0.00000536382 / (Z + 5);
    return (Z - 0.5) * Math.log(Z + 4.5) - (Z + 4.5) + Math.log(S * 2.50662827465);
  }
  window.LogGamma = LogGamma;

  function Betinc(X, A, B) {
    let A0 = 0;
    let B0 = 1;
    let A1 = 1;
    let B1 = 1;
    let M9 = 0;
    let A2 = 0;
    let C9;

    while (Math.abs((A1 - A2) / A1) > 0.00001) {
      A2 = A1;
      C9 = -((A + M9) * (A + B + M9) * X) / ((A + 2 * M9) * (A + 2 * M9 + 1));
      A0 = A1 + C9 * A0;
      B0 = B1 + C9 * B0;
      M9 += 1;
      C9 = (M9 * (B - M9) * X) / ((A + 2 * M9 - 1) * (A + 2 * M9));
      A1 = A0 + C9 * A1;
      B1 = B0 + C9 * B1;
      A0 = A0 / B1;
      B0 = B0 / B1;
      A1 = A1 / B1;
      B1 = 1;
    }

    return A1 / A;
  }
  window.Betinc = Betinc;

  function cumulativeProbabilityTDistribution(X, df) {
    const A = df / 2;
    const S = A + 0.5;
    const Z = df / (df + X * X);
    const BT = Math.exp(LogGamma(S) - LogGamma(0.5) - LogGamma(A) + A * Math.log(Z) + 0.5 * Math.log(1 - Z));
    let betacdf;
    if (Z < (A + 1) / (S + 2)) {
      betacdf = BT * Betinc(Z, A, 0.5);
    } else {
      betacdf = 1 - BT * Betinc(1 - Z, 0.5, A);
    }
    let tcdf = X < 0 ? betacdf / 2 : 1 - betacdf / 2;
    tcdf = Math.round(tcdf * 100000) / 100000;
    return tcdf;
  }
  window.cumulativeProbabilityTDistribution = cumulativeProbabilityTDistribution;

  function invCumulativeProbabilityTDistribution(p, df) {
    if (p >= 0.5) {
      let Z1 = 0;
      for (let Z = 0; Z < 100; Z += 1) {
        if (cumulativeProbabilityTDistribution(Z, df) >= p) break;
        Z1 = Z;
      }
      let Z2 = Z1;
      for (let Z = 0.0; Z < 100.0; Z += 1.0) {
        if (cumulativeProbabilityTDistribution(Z1 + Z / 100.0, df) >= p) break;
        Z2 = Z1 + (Z / 100.0);
      }
      let Z3 = Z2;
      for (let Z = 0.0; Z < 100.0; Z += 1.0) {
        if (cumulativeProbabilityTDistribution(Z2 + Z / 10000.0, df) >= p) break;
        Z3 = Z2 + (Z / 10000.0);
      }
      return Z3;
    }

    let Z1 = 0;
    for (let Z = 0; Z < 100; Z += 1) {
      if (cumulativeProbabilityTDistribution(-Z, df) <= p) break;
      Z1 = Z;
    }
    let Z2 = Z1;
    for (let Z = 0.0; Z < 100.0; Z += 1.0) {
      if (cumulativeProbabilityTDistribution(-Z1 - Z / 100.0, df) <= p) break;
      Z2 = Z1 + (Z / 100.0);
    }
    let Z3 = Z2;
    for (let Z = 0.0; Z < 100.0; Z += 1.0) {
      if (cumulativeProbabilityTDistribution(-Z2 - Z / 10000.0, df) <= p) break;
      Z3 = Z2 + (Z / 10000.0);
    }
    return -Z3;
  }
  window.invCumulativeProbabilityTDistribution = invCumulativeProbabilityTDistribution;

  function ltqnorm(p) {
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const LOW = 0.02425;
    const HIGH = 0.97575;
    let q;
    let r;

    if (p < 0 || p > 1) return 0.0;
    if (p === 0) return Number.NEGATIVE_INFINITY;
    if (p === 1) return Number.POSITIVE_INFINITY;

    if (p < LOW) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }

    if (p > HIGH) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }

    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  window.ltqnorm = ltqnorm;

  updateMainScales();
  createResidualPlot();
  createQQPlot();
  newdata_plot(false);
})();
