import * as THREE from 'three';

// 1. Glowing Neon Grid Shader Definitions
export const neonGridShader = {
  vertexShader: `
    #ifndef USE_INSTANCING
      attribute mat4 instanceMatrix;
    #endif
    varying vec3 vWorldPosition;
    varying vec3 vLocalPosition;

    void main() {
      // Compute world position including instanced transformation matrix if used
      #ifdef USE_INSTANCING
        vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
      #else
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
      #endif
      
      vWorldPosition = worldPos.xyz;
      vLocalPosition = position;
      
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    #extension GL_OES_standard_derivatives : enable

    uniform vec3 uPlayerCoords;     // Player marble coordinates
    uniform vec3 uGridColor;        // Default grid color (e.g. Cyan)
    uniform vec3 uGlowColor;        // Proximity glow color (e.g. Magenta)
    uniform float uGridSize;        // Size of grid lines spacing
    uniform float uGlowRadius;      // Distance radius where marble affects grid
    uniform float uTime;            // Timestep for animation

    varying vec3 vWorldPosition;
    varying vec3 vLocalPosition;

    // High-fidelity grid line calculation using pixel derivatives (fwidth)
    float getGridIntensity(vec2 uv, float thickness) {
      vec2 grid = abs(fract(uv - 0.5) - 0.5) / fwidth(uv);
      float line = min(grid.x, grid.y);
      return 1.0 - min(line * thickness, 1.0);
    }

    void main() {
      // Map grid lines based on local XZ coordinates of the track segment
      vec2 uv = vLocalPosition.xz / uGridSize;
      float gridLine = getGridIntensity(uv, 0.12);

      // Compute player marble distance
      float dist = distance(vWorldPosition, uPlayerCoords);

      // Proximity factor (1.0 = directly under marble, 0.0 = outside glow radius)
      float proximity = clamp(1.0 - (dist / uGlowRadius), 0.0, 1.0);
      
      // Animate glow with time-based sinusoidal pulse
      float pulse = 0.85 + 0.15 * sin(uTime * 4.0);
      float activeGlow = pow(proximity, 2.0) * pulse;

      // Morph grid color based on active glow
      vec3 gridBaseColor = mix(uGridColor, uGlowColor, activeGlow);

      // Grid emission: bright core on lines, ambient glow on surface near player
      vec3 finalColor = gridBaseColor * (gridLine * 1.5 + activeGlow * 2.0);
      
      // Subtle dark grid backing
      vec3 background = uGridColor * 0.03 * (1.0 + activeGlow);
      finalColor = mix(background, finalColor, gridLine);

      // Add a retro-cyberpunk digital scanline effect
      float scanline = sin(vWorldPosition.y * 12.0 + uTime * 3.0) * 0.05;
      finalColor += scanline * gridBaseColor;

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `,
};

// 2. Distance-Responsive Cook-Torrance PBR Shader Definitions
export const distancePbrShader = {
  vertexShader: `
    #ifndef USE_INSTANCING
      attribute mat4 instanceMatrix;
    #endif
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying vec2 vUv;

    void main() {
      vUv = uv;
      
      // Transform normals considering instance scaling and rotation
      #ifdef USE_INSTANCING
        mat4 modelInstMatrix = modelMatrix * instanceMatrix;
      #else
        mat4 modelInstMatrix = modelMatrix;
      #endif
      
      vNormal = normalize(mat3(modelInstMatrix) * normal);
      
      #ifdef USE_INSTANCING
        vec4 worldPos = modelInstMatrix * vec4(position, 1.0);
      #else
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
      #endif
      
      vWorldPosition = worldPos.xyz;
      
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform vec3 uPlayerCoords;
    uniform vec3 uLightPosition;
    uniform vec3 uLightColor;
    uniform vec3 uCameraPosition;

    // Base configuration
    uniform vec3 uAlbedo;
    uniform float uBaseRoughness;
    uniform float uBaseMetalness;
    uniform vec3 uEmissiveColor;

    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying vec2 vUv;

    const float PI = 3.14159265359;

    // 1. Trowbridge-Reitz GGX Normal Distribution Function (D)
    float D_GGX(float NdotH, float roughness) {
      float clampedRoughness = max(roughness, 0.001);
      float a = clampedRoughness * clampedRoughness;
      float a2 = a * a;
      const float pi = 3.14159265359;
      float NdotH2 = NdotH * NdotH;
      float denom = (NdotH2 * (a2 - 1.0) + 1.0);
      return a2 / (pi * denom * denom);
    }

    // 2. Schlick-GGX Geometry Obstruction Function (G1)
    float G1_SchlickGGX(float NdotV, float roughness) {
      float r = (roughness + 1.0);
      float k = (r * r) / 8.0;
      return NdotV / (NdotV * (1.0 - k) + k);
    }

    // 3. Smith's Geometry attenuation (G)
    float G_Smith(float NdotV, float NdotL, float roughness) {
      return G1_SchlickGGX(NdotV, roughness) * G1_SchlickGGX(NdotL, roughness);
    }

    // 4. Fresnel-Schlick approximation (F)
    vec3 F_Schlick(float cosTheta, vec3 F0) {
      return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
    }

    void main() {
      // Calculate distance and proximity factor
      float dist = distance(vWorldPosition, uPlayerCoords);
      float pbrInfluenceRadius = 7.0;
      float proximity = clamp(1.0 - (dist / pbrInfluenceRadius), 0.0, 1.0);

      // Respond: smooth out (roughness drops) and metallize under the marble
      float roughness = mix(uBaseRoughness, uBaseRoughness * 0.1, proximity);
      float metalness = mix(uBaseMetalness, 0.95, proximity);
      
      // Dynamic emissive glow directly under the marble
      vec3 emissiveGlow = uEmissiveColor * pow(proximity, 3.5) * 4.0;

      // Vectors
      vec3 N = normalize(vNormal);
      vec3 V = normalize(uCameraPosition - vWorldPosition);
      vec3 L = normalize(uLightPosition - vWorldPosition);
      vec3 H = normalize(V + L);

      // Dot Products
      float NdotV = max(dot(N, V), 0.0001);
      float NdotL = max(dot(N, L), 0.0);
      float NdotH = max(dot(N, H), 0.0);
      float HdotV = max(dot(H, V), 0.0);

      // F0 base reflectivity
      vec3 F0 = vec3(0.04);
      F0 = mix(F0, uAlbedo, metalness);

      // Compute Cook-Torrance Components
      float D = D_GGX(NdotH, roughness);
      float G = G_Smith(NdotV, NdotL, roughness);
      vec3 F  = F_Schlick(HdotV, F0);

      // Direct lighting computation
      vec3 kS = F;
      vec3 kD = (vec3(1.0) - kS) * (1.0 - metalness);

      vec3 specularNumerator = D * G * F;
      float specularDenominator = 4.0 * NdotV * NdotL;
      vec3 specular = specularNumerator / max(specularDenominator, 0.001);
      
      vec3 diffuse = uAlbedo / PI;

      // Output radiance
      vec3 directReflection = (kD * diffuse + specular) * uLightColor * NdotL;

      // Ambient Term
      vec3 ambient = vec3(0.02) * uAlbedo;

      vec3 finalColor = ambient + directReflection + emissiveGlow;

      // Reinhard Tone Mapping and Gamma Correction (2.2)
      finalColor = finalColor / (finalColor + vec3(1.0));
      finalColor = pow(finalColor, vec3(1.0 / 2.2));

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `,
};

// 3. GameRenderer Pipeline Setup
export class GameRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;

    // Create Three.js Scene
    this.scene = new THREE.Scene();

    // Create Camera (60 FOV, aspect ratio, 0.1 near, 1000 far)
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    // Create WebGLRenderer with antialiasing and high-performance hints
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // Setup shadow map
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Setup tone mapping and exposure
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    // Initialize light components
    this.initLights();

    // Create custom shader materials
    this.neonGridMaterial = this.createNeonGridMaterial();
    this.distancePbrMaterial = this.createDistancePbrMaterial();

    // Set up resize handler
    this.resizeHandler = () => this.onResize();
    window.addEventListener('resize', this.resizeHandler);
  }

  /**
   * Initializes lights in the scene (indigo ambient, cyan and magenta directional lights).
   */
  initLights() {
    // 1. Ambient Light (indigo/navy blue: 0x0b0b23, intensity 0.4)
    this.ambientLight = new THREE.AmbientLight(0x0b0b23, 0.4);
    this.scene.add(this.ambientLight);

    // 2. Cyan directional light (0x00ffff, intensity 1.2) from front-right
    this.cyanLight = new THREE.DirectionalLight(0x00ffff, 1.2);
    this.cyanLight.position.set(15, 30, 15);
    this.cyanLight.castShadow = true;

    // High-resolution shadow maps for smooth rendering
    this.cyanLight.shadow.mapSize.width = 2048;
    this.cyanLight.shadow.mapSize.height = 2048;
    this.cyanLight.shadow.camera.near = 0.5;
    this.cyanLight.shadow.camera.far = 100;

    const d = 30;
    this.cyanLight.shadow.camera.left = -d;
    this.cyanLight.shadow.camera.right = d;
    this.cyanLight.shadow.camera.top = d;
    this.cyanLight.shadow.camera.bottom = -d;
    this.cyanLight.shadow.bias = -0.0005;

    this.scene.add(this.cyanLight);

    // 3. Hot Magenta directional light (0xff00ff, intensity 1.0) from rear-left
    this.magentaLight = new THREE.DirectionalLight(0xff00ff, 1.0);
    this.magentaLight.position.set(-15, 30, -15);
    this.magentaLight.castShadow = true;
    this.magentaLight.shadow.mapSize.width = 1024;
    this.magentaLight.shadow.mapSize.height = 1024;
    this.magentaLight.shadow.camera.near = 0.5;
    this.magentaLight.shadow.camera.far = 100;
    this.magentaLight.shadow.camera.left = -d;
    this.magentaLight.shadow.camera.right = d;
    this.magentaLight.shadow.camera.top = d;
    this.magentaLight.shadow.camera.bottom = -d;
    this.magentaLight.shadow.bias = -0.0005;

    this.scene.add(this.magentaLight);
  }

  /**
   * Instantiates custom ShaderMaterial for neon grid tracks.
   *
   * @returns {THREE.ShaderMaterial}
   */
  createNeonGridMaterial() {
    return new THREE.ShaderMaterial({
      vertexShader: neonGridShader.vertexShader,
      fragmentShader: neonGridShader.fragmentShader,
      uniforms: {
        uPlayerCoords: { value: new THREE.Vector3(0, 0, 0) },
        uGridColor: { value: new THREE.Color(0x00ffff) }, // Cyan grid lines
        uGlowColor: { value: new THREE.Color(0xff00ff) }, // Magenta glow
        uGridSize: { value: 1.0 },
        uGlowRadius: { value: 10.0 },
        uTime: { value: 0.0 },
      },
      extensions: {
        derivatives: true,
      },
    });
  }

  /**
   * Instantiates custom ShaderMaterial for Cook-Torrance distance-responsive PBR tracks.
   *
   * @returns {THREE.ShaderMaterial}
   */
  createDistancePbrMaterial() {
    return new THREE.ShaderMaterial({
      vertexShader: distancePbrShader.vertexShader,
      fragmentShader: distancePbrShader.fragmentShader,
      uniforms: {
        uPlayerCoords: { value: new THREE.Vector3(0, 0, 0) },
        uLightPosition: { value: new THREE.Vector3(15, 30, 15) },
        uLightColor: { value: new THREE.Color(0x00ffff) },
        uCameraPosition: { value: new THREE.Vector3(0, 0, 0) },
        uAlbedo: { value: new THREE.Color(0x0b0b23) }, // dark indigo base albedo
        uBaseRoughness: { value: 0.8 },
        uBaseMetalness: { value: 0.2 },
        uEmissiveColor: { value: new THREE.Color(0xff00ff) }, // hot magenta glow
      },
    });
  }

  /**
   * Resizing event handler to keep renderer layout up-to-date.
   */
  onResize() {
    if (typeof window !== 'undefined') {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
  }

  /**
   * Dynamic updates for shader uniforms.
   *
   * @param {THREE.Vector3} playerPosition - Interpolated coordinates of the player marble.
   * @param {number} time - Current elapsed time in seconds.
   */
  updateUniforms(playerPosition, time) {
    // 1. Update player coords for proximity effects
    this.neonGridMaterial.uniforms.uPlayerCoords.value.copy(playerPosition);
    this.distancePbrMaterial.uniforms.uPlayerCoords.value.copy(playerPosition);

    // 2. Update camera coordinates for Cook-Torrance reflection calculations
    this.distancePbrMaterial.uniforms.uCameraPosition.value.copy(this.camera.position);

    // 3. Sync light positions
    if (this.cyanLight) {
      this.distancePbrMaterial.uniforms.uLightPosition.value.copy(this.cyanLight.position);
    }

    // 4. Update pulsing timestep
    this.neonGridMaterial.uniforms.uTime.value = time;
  }

  /**
   * Render pass execution.
   */
  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Cleans up listeners and disposes of WebGL context objects.
   */
  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.resizeHandler);
    }
    this.renderer.dispose();
  }
}
