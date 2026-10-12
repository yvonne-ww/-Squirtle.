  function stepPhysics(dt) {
    const balls = state.balls;
    const merges = [];
    const contacts = [];

    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      b.px = b.x;
      b.py = b.y;
      b.vy += GRAVITY * dt;
      b.pvx = b.vx;
      b.pvy = b.vy;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.contacts = 0;
      syncParts(b);
    }

    for (let it = 0; it < ITER; it++) {
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (b.dead) continue;
        let pushL = 0, pushR = 0, pushFloor = 0, pushCeil = 0;
        const n = b.parts.length;
        for (let k = 0; k < n; k++) {
          const x = b.wx[k], y = b.wy[k], rr = b.ws[k];
          const l = WALL - (x - rr);
          if (l > pushL) pushL = l;
          const rgt = (x + rr) - (W - WALL);
          if (rgt > pushR) pushR = rgt;
          const dn = (y + rr) - (H - WALL);
          if (dn > pushFloor) pushFloor = dn;
          const up = -(y - rr);
          if (up > pushCeil) pushCeil = up;
        }
        if (pushL || pushR || pushFloor || pushCeil) {
          b.x += pushL - pushR;
          b.y += pushCeil - pushFloor;
          b.contacts++;
          if (it === 0) {
            if (pushL)     contacts.push({ ball: b, nx: 1,  ny: 0 });
            if (pushR)     contacts.push({ ball: b, nx: -1, ny: 0 });
            if (pushFloor) contacts.push({ ball: b, nx: 0,  ny: -1 });
            if (pushCeil)  contacts.push({ ball: b, nx: 0,  ny: 1 });
          }
          syncParts(b);
        }
      }

      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        if (a.dead) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j];
          if (b.dead || a.dead) continue;

          const cdx = b.x - a.x, cdy = b.y - a.y;
          const rbSum = a.rb + b.rb;
          if (cdx * cdx + cdy * cdy >= rbSum * rbSum) continue;

          const pa = a.parts.length, pb = b.parts.length;
          let minGap = 1e9, bnx = 0, bny = 0;

          for (let m = 0; m < pa; m++) {
            const ax = a.wx[m], ay = a.wy[m], ar = a.ws[m];
            const ddx = b.x - ax, ddy = b.y - ay;
            const far = b.rb + ar;
            if (ddx * ddx + ddy * ddy >= far * far) continue;

            for (let k = 0; k < pb; k++) {
              const bx = b.wx[k], by = b.wy[k], br = b.ws[k];
              const dx = bx - ax, dy = by - ay;
              const sum = ar + br;
              const d2 = dx * dx + dy * dy;
              if (d2 >= sum * sum) continue;
              const d = Math.sqrt(d2);
              const gap = d - sum;
              if (gap < minGap) {
                minGap = gap;
                if (d < 1e-4) { bnx = 1; bny = 0; }
                else { bnx = dx / d; bny = dy / d; }
              }
            }
          }

          if (minGap === 1e9) continue;

          const mergeTolerance = Math.min(1.1, Math.max(0.35, (a.r + b.r) * 0.02));
          if (a.tier === b.tier && minGap <= mergeTolerance) {
            a.dead = true;
            b.dead = true;
            merges.push([a, b]);
            continue;
          }

          if (minGap >= 0.12) continue;
          if (it === 0) contacts.push({ a: a, b: b, nx: bnx, ny: bny });
          const corr = Math.min(Math.max(0, -minGap + 0.06), 4) * 0.9;
          if (corr <= 0) continue;
          const invSum = a.invMass + b.invMass;
          const wa = a.invMass / invSum;
          const wb = b.invMass / invSum;

          a.x -= bnx * corr * wa;  a.y -= bny * corr * wa;
          b.x += bnx * corr * wb;  b.y += bny * corr * wb;

          a.contacts++;
          b.contacts++;
          syncParts(a);
          syncParts(b);
        }
      }
    }

    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.dead) continue;
      let pushL = 0, pushR = 0, pushFloor = 0, pushCeil = 0;
      for (let k = 0; k < b.parts.length; k++) {
        const x = b.wx[k], y = b.wy[k], rr = b.ws[k];
        const l = WALL - (x - rr);         if (l > pushL) pushL = l;
        const rgt = (x + rr) - (W - WALL); if (rgt > pushR) pushR = rgt;
        const dn = (y + rr) - (H - WALL);  if (dn > pushFloor) pushFloor = dn;
        const up = -(y - rr);              if (up > pushCeil) pushCeil = up;
      }
      if (pushL || pushR || pushFloor || pushCeil) {
        b.x += pushL - pushR;
        b.y += pushCeil - pushFloor;
        b.contacts++;
        syncParts(b);
      }
    }

    const invDt = 1 / dt;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.dead) continue;

      const dx = b.x - b.px;
      const dy = b.y - b.py;

      let vx = dx * invDt;
      let vy = dy * invDt;

      if (b.contacts > 0) vx *= FRICTION;
      if (b.sq > 0) b.sq = Math.max(0, b.sq - b.sq * SQUASH_DECAY * dt);

      b.vx = vx;
      b.vy = vy;
      b.angle += dx / b.r * 0.85;

      if (!b.landed) {
        if (b.contacts > 0 || performance.now() - b.bornAt > 900) b.landed = true;
      }
    }

    for (let k = 0; k < contacts.length; k++) {
      const ct = contacts[k];

      if (ct.ball) {
        const b = ct.ball;
        if (b.dead) continue;
        const vnPre = b.pvx * ct.nx + b.pvy * ct.ny;
        if (vnPre < -REST_THRESHOLD) {
          const vnPost = b.vx * ct.nx + b.vy * ct.ny;
          const target = -WALL_RESTITUTION * vnPre;
          const j = target - vnPost;
          if (j > 0) {
            b.vx += j * ct.nx;
            b.vy += j * ct.ny;
            squash(b, ct.nx, ct.ny, -vnPre);
          }
        }
      } else {
        const a = ct.a, b = ct.b;
        if (a.dead || b.dead) continue;
        const nx = ct.nx, ny = ct.ny;
        const vnPre = (a.pvx - b.pvx) * nx + (a.pvy - b.pvy) * ny;
        if (vnPre > REST_THRESHOLD) {
          const vnPost = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          const target = -RESTITUTION * vnPre;
          const j = (vnPost - target) / (a.invMass + b.invMass);
          if (j > 0) {
            a.vx -= j * a.invMass * nx;  a.vy -= j * a.invMass * ny;
            b.vx += j * b.invMass * nx;  b.vy += j * b.invMass * ny;
            squash(a, -nx, -ny, vnPre);
            squash(b, nx, ny, vnPre);
          }
        }
      }
    }

    if (merges.length) processMerges(merges);
  }

  function drawBalls() {
    const now = performance.now();
    const balls = state.balls;
    const sorted = balls.slice().sort((a, b) => {
      const aDepth = a.y + a.r;
      const bDepth = b.y + b.r;
      if (Math.abs(aDepth - bDepth) > 0.001) return aDepth - bDepth;
      return b.r - a.r;
    });

    for (let i = 0; i < sorted.length; i++) {
      const b = sorted[i];
      if (b.dead) continue;

      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#7a9ab0';
      ctx.beginPath();
      ctx.ellipse(b.x, H - WALL - 1, b.r * 0.86, Math.max(3, b.r * 0.17), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      let scale = 1;
      if (b.popAt) {
        const t = (now - b.popAt) / 220;
        if (t < 1) scale = 1 + 0.28 * (1 - t);
        else b.popAt = 0;
      }
      const shape = b.sq > 0.004 ? { a: b.sqA, k: b.sq } : null;
      drawFruit(ctx, b.x, b.y, b.r, b.tier, b.angle, scale, shape);
    }
  }
