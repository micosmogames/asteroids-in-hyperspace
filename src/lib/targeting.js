/* global THREE */

const V0 = new THREE.Vector3(0, 0, 0);
const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();

// Targeting services

/*
*  Given a position and velocity of a target and launcher, as well as a projectile speed
*  calculate time to intercept.
*  Based on https://www.gamasutra.com/blogs/ScottLembcke/20180508/316662/Shooting_a_Moving_Target.php
*/
export function timeToIntercept(launchPos, launchVel = V0, targetPos, targetVel, projSpeed) {
  //  Let TP = targetPos, LP = launchPos, RP = TP - LP , TV = targetVel, TRV = TV - launchVel, PS = projSpeed, PV = projVel, t = time
  //  1. LP + PV * t = TP + TRV * t
  //  2. PV * t = TP + TRV * t - LP ==> TRV * t + RP
  //  3. PV * t = TRV * t + RP
  //  4. PV^2 * t^2 = TRV^2 * t^2 + 2 * TRV * RP * t + RP^2
  //  5. PV.PV * t^2 = TRV.TRV * t^2 + 2 * TRV.RP * t + RP.RP
  //  6. PS^2 * t^2 = TRV.TRV * t^2 + 2 * TRV.RP * t + RP.RP
  //  7. 0 = (TRV.TRV - PS^2) * t^2 + 2 * TRV.RP * t + RP.RP
  //  8. 0 = at^2 + bt + c => a = TRV.TRV - PS^2, b = 2 * TRV.RP, c = RP.RP

  const TP = targetPos; const LP = launchPos; const RP = V1.copy(TP).sub(LP);
  const TV = targetVel; const TRV = V2.copy(TV).sub(launchVel);
  const PS = projSpeed;

  const a = TRV.dot(TRV) - PS * PS;
  const b = 2 * TRV.dot(RP);
  const c = RP.dot(RP);

  // discriminant = b^2 - 4ac
  const discriminant = b * b - 4 * a * c;
  // Return value is 'c/at'.
  return discriminant <= 0 ? undefined : 2 * c / (Math.sqrt(discriminant) - b);
}
