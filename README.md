# PaceLab V6.4

PaceLab เป็นแอปบันทึกการวิ่งแบบ offline-first สำหรับ Android และ iOS ปัจจุบัน
workspace มีเฉพาะ shared domain logic ของ Phase 1 ยังไม่มี UI, native GPS/audio,
cloud services หรือการเผยแพร่แอป

## เริ่มพัฒนา

ต้องใช้ Node.js 22.12 ขึ้นไปและ npm

```powershell
npm install
npm test
npm run typecheck
```

แพ็กเกจ `packages/domain` ไม่มี dependency กับ React Native, Expo, network หรือ
platform API; ใช้เมตรและมิลลิวินาทีเป็นหน่วยภายใน

## Domain contract

- `WorkoutDefinition` รองรับ warm-up, cooldown, หลาย work steps, repeats และ
  recovery ที่แทรกระหว่าง repetitions; recovery หลัง repetition สุดท้ายจะเพิ่ม
  เฉพาะเมื่อกำหนดไว้อย่างชัดเจน
- `expandWorkoutTimeline` คืน execution IDs ที่ไม่ซ้ำและลำดับ step ที่ขยายครบ
  ก่อนเริ่ม Structured Workout
- `createWorkoutRunState` ใช้ countdown เริ่มต้น 5 วินาทีและเปิด switches ทั้ง
  pre-start, end-of-work และ before-next-work
- State machine ใช้สถานะ READY, PRESTART, ACTIVE_WARMUP, ACTIVE_WORK,
  ACTIVE_RECOVERY, ACTIVE_COOLDOWN, PAUSED, COMPLETED และ ABORTED; รับเวลา
  monotonic จาก caller แทนการสะสม `setInterval` ticks
- การหยุดพักไม่เพิ่มเวลาและไม่เล่น cue ซ้ำ; เมื่อกลับมาทำงานจะข้ามตัวเลข countdown
  ที่พลาด แทนการเล่นย้อนหลังเป็นชุด
- state machine คืน `CUE_SKIPPED` พร้อมเหตุผล `STALE` เพื่อให้ platform adapter
  บันทึก missed cues; Phase 1 ยังไม่เก็บ event log ลง persistent storage
- Distance-based step เดินหน้าจากระยะที่วัดได้จริงเท่านั้น และให้ค่า remaining
  distance จากระยะสะสมใน step ปัจจุบันโดยไม่คาดเดาเวลาเป้าหมาย
- Cue ที่ถูกประมวลผลช้ากว่าเวลาที่กำหนดเกิน 1 วินาทีจะมี `audible: false`;
  1 วินาทีนี้เป็น stale-cue threshold ของ domain layer สำหรับ Phase 1

## Phase status

- Phase 0: architecture และ validation plan — เสร็จแล้ว
- Phase 1: shared workout domain และ automated tests — เสร็จแล้ว
- Phase 2 เป็นต้นไปต้องได้รับอนุมัติแยกต่างหาก

การผ่าน unit tests/typecheck ไม่ได้ยืนยัน Android/iOS background GPS, audio,
permissions หรือการทำงานบนอุปกรณ์จริง
