/**
 * 3D Polyhedral Dice Engine for the VTT Tabletop
 * Renders true 3D polyhedral meshes (d4, d6, d8, d10, d12, d20, d100, dF)
 * with 3D rigid-body bounce physics, dynamic lighting, ground shadows,
 * and perspective-mapped face numerals that settle on the rolled result.
 */
(function (global) {
    'use strict';

    // Vector & Matrix helpers
    function vec3(x, y, z) { return { x: x, y: y, z: z }; }
    function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
    function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
    function scale(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
    function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
    function cross(a, b) {
        return {
            x: a.y * b.z - a.z * b.y,
            y: a.z * b.x - a.x * b.z,
            z: a.x * b.y - a.y * b.x
        };
    }
    function normalize(v) {
        const len = Math.hypot(v.x, v.y, v.z) || 1;
        return { x: v.x / len, y: v.y / len, z: v.z / len };
    }

    // 3x3 Rotation Matrix utilities
    function matMul(A, B) {
        const R = new Array(9).fill(0);
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                R[r * 3 + c] =
                    A[r * 3 + 0] * B[0 * 3 + c] +
                    A[r * 3 + 1] * B[1 * 3 + c] +
                    A[r * 3 + 2] * B[2 * 3 + c];
            }
        }
        return R;
    }

    function matVec(M, v) {
        return {
            x: M[0] * v.x + M[1] * v.y + M[2] * v.z,
            y: M[3] * v.x + M[4] * v.y + M[5] * v.z,
            z: M[6] * v.x + M[7] * v.y + M[8] * v.z
        };
    }

    function rotX(a) {
        const c = Math.cos(a), s = Math.sin(a);
        return [1, 0, 0, 0, c, -s, 0, s, c];
    }
    function rotY(a) {
        const c = Math.cos(a), s = Math.sin(a);
        return [c, 0, s, 0, 1, 0, -s, 0, c];
    }
    function rotZ(a) {
        const c = Math.cos(a), s = Math.sin(a);
        return [c, -s, 0, s, c, 0, 0, 0, 1];
    }

    // Build proper rotation matrix (det = +1) that aligns face.uAxis -> +X,
    // face.vAxis -> +Y, and face.normal -> +Z so the numeral settles upright
    function buildAlignmentMatrix(face) {
        const u = face.uAxis;
        const v = face.vAxis;
        const n = face.normal;
        return [
            u.x, u.y, u.z,
            v.x, v.y, v.z,
            n.x, n.y, n.z
        ];
    }

    // Normalize vertices to unit radius and precompute face normals & tangent frames
    function finalizeGeometry(rawVerts, faces) {
        const verts = rawVerts.map(v => normalize(vec3(v[0], v[1], v[2])));
        const processedFaces = faces.map(indices => {
            let cx = 0, cy = 0, cz = 0;
            indices.forEach(i => {
                cx += verts[i].x;
                cy += verts[i].y;
                cz += verts[i].z;
            });
            const centroid = vec3(cx / indices.length, cy / indices.length, cz / indices.length);
            const v0 = verts[indices[0]];
            const v1 = verts[indices[1]];
            const v2 = verts[indices[2]];
            let normal = normalize(cross(sub(v1, v0), sub(v2, v0)));
            // Ensure outward normal
            if (dot(normal, centroid) < 0) {
                normal = scale(normal, -1);
                indices = [...indices].reverse();
            }
            // Tangent basis on the face for perspective text rendering
            const edge0 = normalize(sub(verts[indices[0]], centroid));
            const uAxis = normalize(cross(edge0, normal));
            const vAxis = cross(normal, uAxis);

            return {
                indices,
                centroid,
                normal,
                uAxis,
                vAxis
            };
        });
        return { verts, faces: processedFaces };
    }

    // Construct Platonic & RPG Polyhedra
    function createPolyhedra() {
        const phi = (1 + Math.sqrt(5)) / 2;
        const invPhi = 1 / phi;

        // 1. Tetrahedron (d4)
        const d4 = finalizeGeometry(
            [
                [1, 1, 1],
                [1, -1, -1],
                [-1, 1, -1],
                [-1, -1, 1]
            ],
            [
                [0, 1, 2],
                [0, 3, 1],
                [0, 2, 3],
                [1, 3, 2]
            ]
        );

        // 2. Cube / Hexahedron (d6 & dF)
        const d6 = finalizeGeometry(
            [
                [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
                [-1, -1, 1],  [1, -1, 1],  [1, 1, 1],  [-1, 1, 1]
            ],
            [
                [4, 5, 6, 7], // Front (+Z)
                [1, 0, 3, 2], // Back (-Z)
                [5, 1, 2, 6], // Right (+X)
                [0, 4, 7, 3], // Left (-X)
                [7, 6, 2, 3], // Top (+Y)
                [0, 1, 5, 4]  // Bottom (-Y)
            ]
        );

        // 3. Octahedron (d8)
        const d8 = finalizeGeometry(
            [
                [1, 0, 0], [-1, 0, 0],
                [0, 1, 0], [0, -1, 0],
                [0, 0, 1], [0, 0, -1]
            ],
            [
                [4, 0, 2], [4, 2, 1], [4, 1, 3], [4, 3, 0],
                [5, 2, 0], [5, 1, 2], [5, 3, 1], [5, 0, 3]
            ]
        );

        // 4. Icosahedron (d20)
        const d20Verts = [
            [-1,  phi, 0], [ 1,  phi, 0], [-1, -phi, 0], [ 1, -phi, 0],
            [ 0, -1,  phi], [ 0,  1,  phi], [ 0, -1, -phi], [ 0,  1, -phi],
            [ phi, 0, -1], [ phi, 0,  1], [-phi, 0, -1], [-phi, 0,  1]
        ];
        const d20Faces = [
            [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
            [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
            [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
            [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
        ];
        const d20 = finalizeGeometry(d20Verts, d20Faces);

        // 5. Dodecahedron (d12) - Dual of Icosahedron
        const d12Verts = [
            // (±1, ±1, ±1)
            [-1, -1, -1], [-1, -1,  1], [-1,  1, -1], [-1,  1,  1],
            [ 1, -1, -1], [ 1, -1,  1], [ 1,  1, -1], [ 1,  1,  1],
            // (0, ±1/phi, ±phi)
            [0, -invPhi, -phi], [0, -invPhi,  phi], [0,  invPhi, -phi], [0,  invPhi,  phi],
            // (±1/phi, ±phi, 0)
            [-invPhi, -phi, 0], [-invPhi,  phi, 0], [ invPhi, -phi, 0], [ invPhi,  phi, 0],
            // (±phi, 0, ±1/phi)
            [-phi, 0, -invPhi], [ phi, 0, -invPhi], [-phi, 0,  invPhi], [ phi, 0,  invPhi]
        ];
        const d12Faces = [
            [9, 11, 7, 19, 5],
            [11, 9, 1, 18, 3],
            [11, 3, 13, 15, 7],
            [7, 15, 6, 17, 19],
            [5, 19, 17, 4, 14],
            [9, 5, 14, 12, 1],
            [1, 12, 0, 16, 18],
            [18, 16, 2, 13, 3],
            [13, 2, 10, 6, 15],
            [6, 10, 8, 4, 17],
            [4, 8, 0, 12, 14],
            [0, 8, 10, 2, 16]
        ];
        const d12 = finalizeGeometry(d12Verts, d12Faces);

        // 6. Pentagonal Bipyramid / Decahedron (d10 & d100)
        const d10Verts = [
            [0, 0, 1.15],  // 0: North apex
            [0, 0, -1.15]  // 1: South apex
        ];
        for (let i = 0; i < 5; i++) {
            const a = (i * 2 * Math.PI) / 5;
            d10Verts.push([Math.cos(a), Math.sin(a), 0.12]);
        }
        for (let i = 0; i < 5; i++) {
            const a = ((i + 0.5) * 2 * Math.PI) / 5;
            d10Verts.push([Math.cos(a), Math.sin(a), -0.12]);
        }
        const d10Faces = [];
        for (let i = 0; i < 5; i++) {
            const next = (i + 1) % 5;
            d10Faces.push([0, 2 + i, 7 + i, 2 + next]);
            d10Faces.push([1, 7 + next, 2 + next, 7 + i]);
        }
        const d10 = finalizeGeometry(d10Verts, d10Faces);

        return { d4, d6, dF: d6, d8, d10, d100: d10, d12, d20 };
    }

    const GEOMETRIES = createPolyhedra();

    // Palette per die type
    const DIE_STYLES = {
        d4:   { base: [30, 136, 229], accent: '#90caf9', text: '#ffffff', radius: 42 },
        d6:   { base: [216, 59, 45],  accent: '#ffab91', text: '#ffffff', radius: 40 },
        dF:   { base: [142, 36, 170], accent: '#e1bee7', text: '#ffffff', radius: 40 },
        d8:   { base: [0, 150, 136],  accent: '#80cbc4', text: '#ffffff', radius: 43 },
        d10:  { base: [245, 124, 0],  accent: '#ffe082', text: '#ffffff', radius: 44 },
        d100: { base: [57, 73, 171],  accent: '#9fa8da', text: '#ffffff', radius: 45 },
        d12:  { base: [67, 160, 71],  accent: '#a5d6a7', text: '#ffffff', radius: 45 },
        d20:  { base: [183, 28, 28],  accent: '#ffd54f', text: '#fff8e1', radius: 47 }
    };

    class DiceTabletopEngine {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.activeDice = [];
            this.animFrame = null;
            this.clearTimer = null;
            this.banner = null;

            this.resize();
            window.addEventListener('resize', () => this.resize());
        }

        resize() {
            if (!this.canvas || !this.canvas.parentElement) return;
            const rect = this.canvas.parentElement.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            this.width = Math.max(300, rect.width);
            this.height = Math.max(300, rect.height);
            this.canvas.width = this.width * dpr;
            this.canvas.height = this.height * dpr;
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            if (this.activeDice.length > 0) {
                this.renderFrame(performance.now());
            }
        }

        clear() {
            this.activeDice = [];
            this.banner = null;
            if (this.clearTimer) {
                clearTimeout(this.clearTimer);
                this.clearTimer = null;
            }
            if (this.animFrame) {
                cancelAnimationFrame(this.animFrame);
                this.animFrame = null;
            }
            this.ctx.clearRect(0, 0, this.width, this.height);
        }

        /**
         * Launch a 3D dice roll animation across the open tabletop area.
         */
        rollDice(rollMessage) {
            if (!rollMessage || !rollMessage.roll_data || !Array.isArray(rollMessage.roll_data.dice)) {
                return;
            }
            this.resize();
            if (this.clearTimer) clearTimeout(this.clearTimer);

            const diceSpecs = rollMessage.roll_data.dice;
            const count = diceSpecs.length;
            const now = performance.now();

            // Compute target layout grid in the center of the open tabletop
            const cols = Math.ceil(Math.sqrt(count * 1.4));
            const rows = Math.ceil(count / cols);
            const spacingX = Math.min(125, Math.max(82, (this.width - 160) / Math.max(1, cols)));
            const spacingY = Math.min(125, Math.max(82, (this.height - 200) / Math.max(1, rows)));

            const centerX = this.width * 0.5;
            const centerY = this.height * 0.5 - 15;

            this.activeDice = diceSpecs.map((spec, idx) => {
                const geomKey = GEOMETRIES[spec.type] ? spec.type : 'd20';
                const geom = GEOMETRIES[geomKey];
                const style = DIE_STYLES[geomKey] || DIE_STYLES.d20;

                const col = idx % cols;
                const row = Math.floor(idx / cols);
                const gridX = centerX + (col - (cols - 1) / 2) * spacingX + (Math.random() - 0.5) * 16;
                const gridY = centerY + (row - (rows - 1) / 2) * spacingY + (Math.random() - 0.5) * 16;

                // Spawn from bottom/side edge as if thrown onto the table
                const throwAngle = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
                const startX = centerX + (Math.random() - 0.5) * (this.width * 0.55);
                const startY = this.height + 60 + Math.random() * 70;

                // Assign labels for all faces of the polyhedron; face[0] gets the exact rolled display value
                const faceLabels = geom.faces.map((_, fIdx) => {
                    if (fIdx === 0) return String(spec.display);
                    if (spec.type === 'dF') {
                        return ['+', '−', '0'][fIdx % 3];
                    }
                    const maxSide = typeof spec.sides === 'number' ? spec.sides : 20;
                    const val = ((fIdx * 7 + idx * 3) % maxSide) + 1;
                    return String(val);
                });

                // Alignment matrix so face[0] finishes facing straight up (+Z) with upright numeral
                const topFace = geom.faces[0];
                const alignMat = buildAlignmentMatrix(topFace);

                return {
                    spec,
                    geom,
                    style,
                    faceLabels,
                    alignMat,
                    startX,
                    startY,
                    targetX: Math.max(70, Math.min(this.width - 70, gridX)),
                    targetY: Math.max(80, Math.min(this.height - 110, gridY)),
                    startTime: now + idx * 35,
                    duration: 1350 + Math.random() * 350,
                    spinX: (Math.random() > 0.5 ? 1 : -1) * (4 + Math.floor(Math.random() * 3)) * Math.PI * 2,
                    spinY: (Math.random() > 0.5 ? 1 : -1) * (4 + Math.floor(Math.random() * 3)) * Math.PI * 2,
                    spinZ: (Math.random() - 0.5) * Math.PI * 4,
                    finalYaw: (Math.random() - 0.5) * 0.35
                };
            });

            this.banner = {
                roller: rollMessage.sender_name,
                formula: rollMessage.roll_data.formula,
                total: rollMessage.roll_data.total,
                isHidden: !!rollMessage.is_hidden_roll,
                createdAt: now
            };

            if (!this.animFrame) {
                const tick = (ts) => {
                    const stillAnimating = this.renderFrame(ts);
                    if (stillAnimating) {
                        this.animFrame = requestAnimationFrame(tick);
                    } else {
                        this.animFrame = null;
                    }
                };
                this.animFrame = requestAnimationFrame(tick);
            }

            // Automatically fade out 3D dice after 8.5 seconds so the map stays unobstructed
            this.clearTimer = setTimeout(() => {
                this.clear();
            }, 8500);
        }

        renderFrame(now) {
            const ctx = this.ctx;
            ctx.clearRect(0, 0, this.width, this.height);

            let anyMoving = false;
            const lightDir = normalize(vec3(-0.4, -0.55, 0.75));

            for (const die of this.activeDice) {
                const elapsed = now - die.startTime;
                if (elapsed < 0) {
                    anyMoving = true;
                    continue;
                }

                const rawT = Math.min(1, elapsed / die.duration);
                if (rawT < 1) anyMoving = true;

                // Quintic ease-out for horizontal travel and spin damping
                const easeOut = 1 - Math.pow(1 - rawT, 3.2);
                const x = die.startX + (die.targetX - die.startX) * easeOut;
                const y = die.startY + (die.targetY - die.startY) * easeOut;

                // Multi-bounce height curve on the tabletop
                const bounceEnv = Math.pow(1 - rawT, 1.8) * Math.abs(Math.sin(rawT * Math.PI * 3.5));
                const zHeight = bounceEnv * 110;

                // Spin angles decay smoothly to 0 so alignMat + finalYaw is reached at rawT = 1
                const spinFactor = Math.pow(1 - rawT, 2.5);
                const rx = die.spinX * spinFactor;
                const ry = die.spinY * spinFactor;
                const rz = die.spinZ * spinFactor + die.finalYaw;

                const tumbleMat = matMul(rotZ(rz), matMul(rotY(ry), rotX(rx)));
                const worldMat = matMul(tumbleMat, die.alignMat);

                this.drawSingleDie(ctx, die, x, y, zHeight, worldMat, lightDir, rawT);
            }

            if (this.banner) {
                this.drawBanner(ctx, this.banner, anyMoving);
            }

            return anyMoving;
        }

        drawSingleDie(ctx, die, screenX, screenY, zHeight, worldMat, lightDir, progress) {
            const { geom, style, faceLabels, spec } = die;
            const scaleRadius = style.radius * (1 + zHeight / 380);
            const fov = 420;

            // 1. Draw soft tabletop shadow underneath the 3D die
            ctx.save();
            const shadowOffset = 10 + zHeight * 0.28;
            const shadowRadius = style.radius * (0.92 - zHeight * 0.0015);
            const grad = ctx.createRadialGradient(
                screenX + shadowOffset * 0.6,
                screenY + shadowOffset,
                shadowRadius * 0.15,
                screenX + shadowOffset * 0.6,
                screenY + shadowOffset,
                shadowRadius * 1.25
            );
            grad.addColorStop(0, 'rgba(0, 0, 0, 0.52)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(screenX + shadowOffset * 0.6, screenY + shadowOffset, shadowRadius * 1.25, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Transform vertices into 3D camera space
            const camVerts = geom.verts.map(v => matVec(worldMat, v));
            const projVerts = camVerts.map(v => {
                const persp = fov / (fov - v.z * scaleRadius);
                return {
                    x: screenX + v.x * scaleRadius * persp,
                    y: screenY - zHeight * 0.65 + v.y * scaleRadius * persp,
                    z: v.z
                };
            });

            // Sort faces back-to-front (painter's algorithm + backface culling)
            const visibleFaces = [];
            geom.faces.forEach((f, fIdx) => {
                const rotNormal = matVec(worldMat, f.normal);
                const rotCentroid = matVec(worldMat, f.centroid);
                // Camera is at +Z looking towards -Z
                if (rotNormal.z > -0.08) {
                    visibleFaces.push({
                        fIdx,
                        face: f,
                        rotNormal,
                        rotCentroid,
                        depth: rotCentroid.z
                    });
                }
            });

            visibleFaces.sort((a, b) => a.depth - b.depth);

            ctx.save();
            if (spec.dropped) {
                ctx.globalAlpha = 0.45;
            }

            // Render each visible polygon face with diffuse + specular lighting
            for (const vf of visibleFaces) {
                const { fIdx, face, rotNormal, rotCentroid } = vf;
                const pts = face.indices.map(i => projVerts[i]);

                const diffuse = Math.max(0, dot(rotNormal, lightDir));
                const specLight = Math.pow(Math.max(0, rotNormal.z), 8) * 0.28;
                const brightness = 0.42 + diffuse * 0.58 + specLight;

                const r = Math.min(255, Math.round(style.base[0] * brightness));
                const g = Math.min(255, Math.round(style.base[1] * brightness));
                const b = Math.min(255, Math.round(style.base[2] * brightness));

                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) {
                    ctx.lineTo(pts[i].x, pts[i].y);
                }
                ctx.closePath();

                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fill();

                // Crisp bevelled edge highlight
                ctx.lineWidth = (fIdx === 0 && progress >= 0.98) ? 2.2 : 1.3;
                ctx.strokeStyle = (fIdx === 0 && progress >= 0.98)
                    ? style.accent
                    : 'rgba(255, 255, 255, 0.28)';
                ctx.stroke();

                // Project 3D tangent frame onto 2D screen to draw perspective-foreshortened face numeral
                if (rotNormal.z > 0.12) {
                    const rotU = matVec(worldMat, face.uAxis);
                    const rotV = matVec(worldMat, face.vAxis);

                    const projectPoint = (p3) => {
                        const persp = fov / (fov - p3.z * scaleRadius);
                        return {
                            x: screenX + p3.x * scaleRadius * persp,
                            y: screenY - zHeight * 0.65 + p3.y * scaleRadius * persp
                        };
                    };

                    const c2d = projectPoint(rotCentroid);
                    const u2d = projectPoint(add(rotCentroid, scale(rotU, 0.35)));
                    const v2d = projectPoint(add(rotCentroid, scale(rotV, 0.35)));

                    const ux = (u2d.x - c2d.x) / 14;
                    const uy = (u2d.y - c2d.y) / 14;
                    const vx = (v2d.x - c2d.x) / 14;
                    const vy = (v2d.y - c2d.y) / 14;

                    ctx.save();
                    ctx.transform(ux, uy, vx, vy, c2d.x, c2d.y);
                    ctx.fillStyle = style.text;
                    ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
                    ctx.shadowBlur = 3;
                    const label = faceLabels[fIdx];
                    ctx.fillText(label, 0, 0);
                    if (label === '6' || label === '9') {
                        ctx.fillRect(-5, 9, 10, 1.8);
                    }
                    ctx.restore();
                }
            }

            // Die type badge below settled die
            if (progress > 0.85) {
                ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
                ctx.strokeStyle = style.accent;
                ctx.lineWidth = 1;
                const tag = `${spec.type.toUpperCase()}: ${spec.display}`;
                ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
                const tw = ctx.measureText(tag).width + 14;
                const bx = screenX - tw / 2;
                const by = screenY + style.radius + 8;
                ctx.beginPath();
                ctx.roundRect(bx, by, tw, 20, 10);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#f8fafc';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(tag, screenX, by + 10);
            }

            ctx.restore();
        }

        drawBanner(ctx, banner, isRolling) {
            ctx.save();
            const text = isRolling
                ? `${banner.roller} is rolling ${banner.formula}...`
                : `${banner.roller} rolled ${banner.formula} = ${banner.total}${banner.isHidden ? ' (Hidden GM Roll)' : ''}`;

            ctx.font = '700 15px "Segoe UI", system-ui, sans-serif';
            const padX = 22;
            const boxW = Math.max(240, ctx.measureText(text).width + padX * 2);
            const boxH = 42;
            const bx = (this.width - boxW) / 2;
            const by = this.height - 64;

            ctx.fillStyle = banner.isHidden ? 'rgba(88, 28, 135, 0.92)' : 'rgba(15, 23, 42, 0.92)';
            ctx.strokeStyle = banner.isHidden ? '#c084fc' : '#f59e0b';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(bx, by, boxW, boxH, 21);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#f8fafc';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, this.width / 2, by + boxH / 2);
            ctx.restore();
        }
    }

    global.DiceTabletopEngine = DiceTabletopEngine;
})(window);
