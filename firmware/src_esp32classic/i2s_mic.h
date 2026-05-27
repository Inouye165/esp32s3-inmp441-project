#pragma once
#include <cstdint>

bool     micInit();
uint32_t micGetSampleRate();

// One-pole high-pass DC blocker
struct DcBlockerState { float x1; float y1; };
void  dcBlockerReset(DcBlockerState& s);
float dcBlockerProcess(DcBlockerState& s, float x);
