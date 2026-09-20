This version belongs to Codex task 01a07919-09eb-7b52-a572-1f2734bda8fa.

Another active task was writing the parent ad-clone directory concurrently. This implementation was isolated here to preserve both versions. This directory owns its source, copied assets, preview records and final output. It does not import components or fonts from the other implementation. The shared input remains ../clone.mp4 and the original reference frames remain ../reference/frames.
