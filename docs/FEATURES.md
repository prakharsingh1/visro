# Visro feature scope

Visro's first macOS build targets independent, local design work with optional Gemini assistance. This is an implemented subset of a much broader design platform, not a promise of every Canva capability.

## First-build target

| Workflow                 | Implementation boundary                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| Design canvas            | Editable text, vector shapes, image placement, selection, movement, scale, and rotation               |
| Templates                | Original starter layouts supplied with Visro; Canva's proprietary template collection is not included |
| Text controls            | Common font, size, color, and alignment controls using fonts available to the app                     |
| Layers                   | Object ordering and selection controls                                                                |
| Pages                    | Multiple local design pages                                                                           |
| Projects                 | Local saving and reopening in Visro's own format                                                      |
| Export                   | Image/vector/document exports offered by the running editor                                           |
| Photo background removal | Real local IS-Net segmentation, returning a PNG alpha channel; bundled CPU model                      |
| AI layout                | A Gemini-generated editable layout, constrained to the app's supported objects                        |
| AI writing               | Prompted draft/copy generation through the user's Gemini API key                                      |
| AI image generation      | Images returned by a Gemini image model enabled on the user's project                                 |
| AI image editing         | A supported source image plus prompt sent to Gemini; requires model access and internet               |
| Key settings             | A user-supplied key handled by the desktop integration; a key is not bundled in the application       |

The app's release validation and screenshots, when supplied, describe which of these targets passed in the packaged build. A wired button alone does not prove an AI request, export, or cutout succeeded.

## Current gaps

| Canva workflow                                              | Visro first-build status                                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Real-time collaboration, comments, team permissions         | Requires a synchronization service; not supplied                                                    |
| Cloud projects, cross-device account sync                   | Not supplied; project files are local                                                               |
| Canva stock photos, licensed video/audio, premium templates | Not included; use imported assets or generated images                                               |
| Video timelines, transitions, audio mix, video export       | Not supplied                                                                                        |
| Video background removal                                    | Not supplied; cutout helper operates on still images                                                |
| Background-removal erase and restore brushes                | Not supplied                                                                                        |
| Full brand library, approval workflows, team kits           | Not supplied                                                                                        |
| Magic Switch document transformations and translation       | Not supplied as a complete document conversion system                                               |
| AI animation, video generation, full Magic Studio parity    | Not supplied                                                                                        |
| Websites, publishing, social scheduling, analytics          | Not supplied                                                                                        |
| Print fulfillment and stock licensing                       | Not supplied                                                                                        |
| Canva Apps marketplace and integrations                     | Not supplied                                                                                        |
| Native import of Canva cloud documents                      | Not supplied; Visro has its own project format                                                      |
| Presentation delivery, presenter mode, recordings           | Basic page presentation view is supplied; presenter notes, recordings, and live delivery are absent |
| Spreadsheet, whiteboard, document, advanced chart products  | Not supplied as separate editing engines                                                            |

Canva's broader product surface is documented in its [official Mac app listing](https://apps.apple.com/us/app/canva-ai-photo-video-editor/id897446215?platform=mac). The comparison records scope; it does not claim that these hosted features can be recreated by substituting a Gemini key.

## Offline behavior

Canvas editing, local projects, exports, and background removal can operate without internet once the app and its bundled assets are installed. Gemini generation and editing need an internet connection and valid model access. The source build needs internet once to install dependencies and prepare the model assets.

## Meaningful acceptance checks

- Create a design, add and edit text, move/resize objects, switch pages, and reopen a saved local project.
- Export and inspect the result at the intended page dimensions.
- Remove the background from an actual photo, check that the subject remains, and confirm transparent pixels in the exported PNG. Repeat after disconnecting from the network to verify the packaged model path.
- With a user-provided Gemini key, generate copy, generate an editable layout, generate an image, and edit a selected image. Confirm real returned content, and make model-access, quota, and network failures understandable.
- Launch the packaged Mac app from its installable artifact and repeat the local workflow. Development-server success does not prove the installed build works.
