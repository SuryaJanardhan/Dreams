# JavaScript migration inventory

Static tracked-file inventory. Caller edges use literal import/require syntax, so external consumers and dynamic paths still need review.

| Source | Direct tracked callers | Initial disposition |
| --- | --- | --- |
| `archive/automate_frontend.js` | No literal tracked caller found | Historical: review support before execution |
| `archive/prepare_data.js` | No literal tracked caller found | Historical: review support before execution |
| `archive/test_full_automation.js` | No literal tracked caller found | Historical: review support before execution |
| `archive/test_new_workflow.js` | No literal tracked caller found | Historical: review support before execution |
| `archive/test_reel_workflow.js` | No literal tracked caller found | Historical: review support before execution |
| `archive/wrap_html.js` | No literal tracked caller found | Historical: review support before execution |
| `bin/create_test_video.js` | `bin/test_video_creation.js`, `bin/test_video_creation2.js` | Tool/harness: classify external side effects |
| `bin/debug_subtitles.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/delete_all_social_posts.js` | No literal tracked caller found | Manual destructive tool; never offline smoke |
| `bin/diagnose_facebook.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/local_test_video.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/mass_cleanup.js` | No literal tracked caller found | Manual destructive tool; never offline smoke |
| `bin/preview_content.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/quick_api_status.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_api_keys_focused.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_api_security.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_consolidated_workflow.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_dummy_video_processing.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_dynamic_timing.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_facebook_dummy.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_facebook_production.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_facebook_upload.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_fresh_dummy_subtitles.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_full_video.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_gemini_audio.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_image.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_image_service.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_image_video_integration.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_instagram_permalink.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_instagram_upload.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_instagram_url.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_local_video_processing.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_oauth2_youtube.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_optimized_compression.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_optimized_workflow.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_posts_empty.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_posts_workflow.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_posts_workflow_endpoint.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_realistic_video.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_reel_generation.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_reference_video_processing.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_resilient_workflow.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_service_separation.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_simplified_image_service.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_simplified_workflow.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_single_title_image.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_slide_generation.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_slide_generation_endpoint.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_social_media_content.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_subtitle_overlay.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_subtitles_only.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_supabase_connection.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_supabase_upload.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_video_composition.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_video_creation.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_video_creation2.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_workflow_auto.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_youtube_upload.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_youtube_upload_dummy.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/test_youtube_upload_small.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `bin/verify_subtitles.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `src/config/database.js` | No literal tracked caller found | Convert with interface parity |
| `src/config/ffmpeg.js` | `src/services/videoProcessingService.js`, `test/server.js` | Convert with interface parity |
| `src/config/google.js` | `src/services/sheetsService.js`, `src/services/videoService.js` | Convert with interface parity |
| `src/config/logger.js` | `bin/create_test_video.js`, `bin/local_test_video.js`, `bin/mass_cleanup.js`, `bin/quick_api_status.js`, `bin/test_api_keys_focused.js`, `bin/test_image_service.js`, `bin/test_service_separation.js`, `bin/test_simplified_image_service.js`, `bin/test_slide_generation.js`, `bin/test_subtitle_overlay.js`, `src/controllers/audioController.js`, `src/controllers/imageController.js`, `src/controllers/reelController.js`, `src/controllers/scriptController.js`, `src/controllers/videoController.js`, `src/controllers/workflowController.js`, `src/main_automation.js`, `src/services/audioService.js`, `src/services/cleanupService.js`, `src/services/emailService.js`, `src/services/facebookPostMaker.js`, `src/services/imageService.js`, `src/services/instagramPostMaker.js`, `src/services/publishingService.js`, `src/services/scriptService.js`, `src/services/sheetsService.js`, `src/services/socialMediaPostingService.js`, `src/services/socialMediaService.js`, `src/services/videoProcessingService.js`, `src/services/videoService.js`, `src/services/voiceboxService.js`, `src/services/wav2lipService.js`, `test/server.js`, `test/test_wav2lip_hq.js`, `test/test_worker_image.js` | Convert with interface parity |
| `src/config/styles.js` | No literal tracked caller found | Convert with interface parity |
| `src/controllers/audioController.js` | `src/routes/audio.js` | Convert with interface parity |
| `src/controllers/imageController.js` | `src/routes/images.js` | Convert with interface parity |
| `src/controllers/reelController.js` | `src/routes/reel.js` | Convert with interface parity |
| `src/controllers/scriptController.js` | `src/routes/script.js` | Convert with interface parity |
| `src/controllers/videoController.js` | `src/routes/video.js` | Convert with interface parity |
| `src/controllers/workflowController.js` | `src/routes/workflow.js` | Convert with interface parity |
| `src/main_automation.js` | No literal tracked caller found | Convert with interface parity |
| `src/middleware/upload.js` | `test/server.js` | Convert with interface parity |
| `src/routes/audio.js` | `test/server.js` | Convert with interface parity |
| `src/routes/images.js` | `test/server.js` | Convert with interface parity |
| `src/routes/reel.js` | No literal tracked caller found | Convert with interface parity |
| `src/routes/script.js` | `test/server.js` | Convert with interface parity |
| `src/routes/testFFmpeg.js` | `src/routes/workflow.js`, `test/server.js` | Convert with interface parity |
| `src/routes/video.js` | `test/server.js` | Convert with interface parity |
| `src/routes/workflow.js` | `test/server.js` | Convert with interface parity |
| `src/services/audioService.js` | `bin/test_gemini_audio.js`, `src/controllers/audioController.js`, `src/controllers/workflowController.js`, `src/main_automation.js` | Convert with interface parity |
| `src/services/cleanupService.js` | `src/controllers/workflowController.js` | Convert with interface parity |
| `src/services/compositionService.js` | `src/main_automation.js` | Convert with interface parity |
| `src/services/emailService.js` | `src/controllers/workflowController.js`, `src/main_automation.js` | Convert with interface parity |
| `src/services/facebookPostMaker.js` | `src/services/socialMediaPostingService.js` | Convert with interface parity |
| `src/services/imageService.js` | `bin/test_api_keys_focused.js`, `bin/test_api_security.js`, `bin/test_consolidated_workflow.js`, `bin/test_dynamic_timing.js`, `bin/test_image_service.js`, `bin/test_image_video_integration.js`, `bin/test_simplified_workflow.js`, `bin/test_single_title_image.js`, `src/controllers/imageController.js`, `src/controllers/workflowController.js`, `test/test_worker_image.js` | Convert with interface parity |
| `src/services/instagramPostMaker.js` | `src/services/socialMediaPostingService.js` | Convert with interface parity |
| `src/services/newFeaturesService.js` | No literal tracked caller found | Convert with interface parity |
| `src/services/publishingService.js` | `src/controllers/workflowController.js`, `src/main_automation.js` | Convert with interface parity |
| `src/services/puppeteerRenderService.js` | No literal tracked caller found | Convert with interface parity |
| `src/services/reactRenderService.js` | No literal tracked caller found | Convert with interface parity |
| `src/services/scriptService.js` | `src/controllers/scriptController.js`, `src/controllers/workflowController.js`, `src/main_automation.js` | Convert with interface parity |
| `src/services/sheetsService.js` | `src/controllers/workflowController.js`, `src/main_automation.js` | Convert with interface parity |
| `src/services/socialMediaPostingService.js` | No literal tracked caller found | Convert with interface parity |
| `src/services/socialMediaService.js` | `bin/delete_all_social_posts.js`, `bin/test_facebook_production.js`, `bin/test_facebook_upload.js`, `bin/test_optimized_workflow.js`, `bin/test_resilient_workflow.js`, `bin/test_youtube_upload_dummy.js`, `bin/test_youtube_upload_small.js`, `src/services/publishingService.js` | Convert with interface parity |
| `src/services/videoProcessingService.js` | `bin/test_api_security.js`, `bin/test_dummy_video_processing.js`, `bin/test_fresh_dummy_subtitles.js`, `bin/test_local_video_processing.js`, `bin/test_optimized_compression.js`, `bin/test_reference_video_processing.js`, `bin/test_single_title_image.js`, `bin/test_subtitles_only.js`, `bin/test_video_composition.js`, `src/controllers/reelController.js`, `src/controllers/workflowController.js` | Convert with interface parity |
| `src/services/videoService.js` | `src/controllers/videoController.js` | Convert with interface parity |
| `src/services/voiceboxService.js` | `src/services/audioService.js`, `test/test_audio_quality.js`, `test/test_voicebox_check.js` | Convert with interface parity |
| `src/services/wav2lipService.js` | `src/main_automation.js`, `test/test_wav2lip_hq.js` | Convert with interface parity |
| `src/utils/subtitles.js` | `src/controllers/reelController.js`, `src/controllers/workflowController.js`, `src/main_automation.js` | Convert with interface parity |
| `src/utils/textCleaner.js` | No literal tracked caller found | Convert with interface parity |
| `test/invoke_workflow.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `test/server.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `test/test_audio_quality.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `test/test_local_endpoint.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `test/test_supabase.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `test/test_voicebox_check.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `test/test_wav2lip_hq.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `test/test_worker_image.js` | No literal tracked caller found | Tool/harness: classify external side effects |
| `test/test_workflow_auto.js` | No literal tracked caller found | Tool/harness: classify external side effects |

## Unresolved literal imports at baseline

- `archive/prepare_data.js` → `./src/services/scriptService`
- `archive/prepare_data.js` → `./src/services/audioService`
- `archive/prepare_data.js` → `./src/services/newFeaturesService`
- `archive/test_full_automation.js` → `./src/services/scriptService`
- `archive/test_full_automation.js` → `./src/services/audioService`
- `archive/test_full_automation.js` → `./src/services/newFeaturesService`
- `archive/test_full_automation.js` → `./src/services/reactRenderService`
- `archive/test_full_automation.js` → `./src/config/styles`
- `archive/test_new_workflow.js` → `./src/services/scriptService`
- `archive/test_new_workflow.js` → `./src/services/audioService`
- `archive/test_new_workflow.js` → `./src/services/newFeaturesService`
- `archive/test_new_workflow.js` → `./src/services/puppeteerRenderService`
- `archive/test_reel_workflow.js` → `./src/services/videoProcessingService`
- `bin/test_service_separation.js` → `./src/services/videoPostingService`
- `bin/test_simplified_image_service.js` → `../src/services/imageServiceSimplified`
