// Nebula Hero from UI Vault library/nebula-hero (MIT, Kone Tshivhinda),
// ported from React to a plain module and re-themed to ink and cornflower.
// Visual direction inspired by Star Nest by Pablo Roman Andrioli and the
// shader adaptation credited to Matthias Hurrle (@atzedent). No shader code
// was copied from either.

(function () {
  var VERTEX = [
    "#version 300 es",
    "precision highp float;",
    "out vec2 vUv;",
    "void main() {",
    "  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));",
    "  vUv = p;",
    "  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);",
    "}"
  ].join("\n");

  var FRAGMENT = [
    "#version 300 es",
    "precision highp float;",
    "out vec4 outColor;",
    "uniform vec2 uResolution;",
    "uniform float uTime;",
    "uniform vec2 uPointer;",
    "",
    "float hash21(vec2 p) {",
    "  p = fract(p * vec2(234.34, 435.345));",
    "  p += dot(p, p + 34.23);",
    "  return fract(p.x * p.y);",
    "}",
    "",
    "float valueNoise(vec2 p) {",
    "  vec2 i = floor(p);",
    "  vec2 f = fract(p);",
    "  vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(",
    "    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),",
    "    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),",
    "    u.y",
    "  );",
    "}",
    "",
    "float fbm(vec2 p) {",
    "  float value = 0.0;",
    "  float amplitude = 0.5;",
    "  for (int i = 0; i < 5; i++) {",
    "    value += amplitude * valueNoise(p);",
    "    p = mat2(1.6, 1.2, -1.2, 1.6) * p;",
    "    amplitude *= 0.5;",
    "  }",
    "  return value;",
    "}",
    "",
    "void main() {",
    "  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / min(uResolution.x, uResolution.y);",
    "  vec2 drift = vec2(uTime * 0.012, -uTime * 0.008);",
    "  vec2 flow = uv * 1.15 + drift + uPointer * 0.08;",
    "",
    "  float warp = fbm(flow * 1.3 + vec2(2.1, -1.7));",
    "  vec2 bent = flow + warp * 0.6;",
    "",
    "  float cloud = fbm(bent * 1.7);",
    "  float veil = fbm(bent * 3.2 + vec2(-uTime * 0.02, uTime * 0.015));",
    "  float nebula = smoothstep(0.38, 0.92, cloud * 0.75 + veil * 0.35);",
    "",
    "  vec2 coreCenter = vec2(0.34, 0.26);",
    "  float core = exp(-dot(uv - coreCenter, uv - coreCenter) * 1.5);",
    "",
    "  vec3 base = vec3(0.035, 0.045, 0.078);",
    "  vec3 cornflower = vec3(0.392, 0.584, 0.929);",
    "  vec3 pale = vec3(0.72, 0.83, 1.0);",
    "",
    "  vec3 color = base;",
    "  color = mix(color, cornflower, nebula * 0.42);",
    "  color = mix(color, pale, core * nebula * 0.55);",
    "",
    "  vec2 starGrid = uv * 220.0;",
    "  vec2 starCell = floor(starGrid);",
    "  float star = step(0.995, hash21(starCell));",
    "  float twinkle = 0.6 + 0.4 * sin(uTime * 2.0 + hash21(starCell) * 20.0);",
    "  color += star * twinkle * 0.32 * vec3(0.82, 0.89, 1.0);",
    "",
    "  float vignette = 1.0 - smoothstep(0.25, 1.35, length(uv));",
    "  color *= mix(0.5, 1.0, vignette);",
    "",
    "  float dither = (hash21(gl_FragCoord.xy) - 0.5) / 255.0;",
    "  outColor = vec4(color + dither, 1.0);",
    "}"
  ].join("\n");

  function compile(gl, type, source) {
    var shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function mount(canvas) {
    var gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
    if (!gl) return;

    var vertexShader = compile(gl, gl.VERTEX_SHADER, VERTEX);
    var fragmentShader = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vertexShader || !fragmentShader) return;

    var program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return;
    }

    var uResolution = gl.getUniformLocation(program, "uResolution");
    var uTime = gl.getUniformLocation(program, "uTime");
    var uPointer = gl.getUniformLocation(program, "uPointer");

    var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var host = canvas.parentElement || canvas;
    var target = { x: 0, y: 0 };
    var smooth = { x: 0, y: 0 };
    var started = performance.now();
    var frameHandle = 0;
    var running = false;
    var onScreen = true;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      // The hero canvas covers a whole band; cap the pixel count so large screens stay smooth.
      var budget = 1800000;
      var area = rect.width * rect.height * dpr * dpr;
      if (area > budget) dpr = dpr * Math.sqrt(budget / area);
      var width = Math.max(1, Math.round(rect.width * dpr));
      var height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
      if (reducedMotion.matches) render(12);
    }

    function render(seconds) {
      gl.useProgram(program);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, seconds);
      gl.uniform2f(uPointer, smooth.x, smooth.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function frame(now) {
      if (!running) return;
      smooth.x += (target.x - smooth.x) * 0.05;
      smooth.y += (target.y - smooth.y) * 0.05;
      render((now - started) / 1000);
      frameHandle = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(frameHandle);
    }

    function start() {
      if (running || reducedMotion.matches || !onScreen || document.hidden) return;
      running = true;
      frameHandle = requestAnimationFrame(frame);
    }

    function update() {
      stop();
      if (reducedMotion.matches) render(12);
      else start();
    }

    function onPointerMove(event) {
      var rect = canvas.getBoundingClientRect();
      target.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      target.y = 1 - ((event.clientY - rect.top) / rect.height) * 2;
    }

    function onPointerLeave() {
      target.x = 0;
      target.y = 0;
    }

    var resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    var intersectionObserver = new IntersectionObserver(function (entries) {
      onScreen = entries[0] ? entries[0].isIntersecting : true;
      update();
    });
    intersectionObserver.observe(canvas);

    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("visibilitychange", update);
    reducedMotion.addEventListener("change", update);

    resize();
    update();
  }

  var canvases = document.querySelectorAll("[data-nebula]");
  for (var i = 0; i < canvases.length; i++) mount(canvases[i]);
})();
