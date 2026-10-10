# Form validation audit

## Findings before this pass

| Field | Previous behavior | Network on typing | Change |
|---|---|---:|---|
| Login email | Uncontrolled native `type=email` field; browser constraints could surface too early | No | Controlled field; visible error only after blur/submit; server error clears on edit |
| Login password | Native `minLength` constraint; no field-level timing | No | Controlled field; neutral helper while typing, error after blur/submit |
| Signup email/password | Same native constraint behavior | No | Same touched/submit behavior as login |
| Business name | Local state only | No | Local draft; generates a slug suggestion only while slug is untouched |
| Permanent URL slug | Lowercased and invalid characters replaced on every keystroke; native `pattern` | No before this pass | Manual text preserved; format validation deferred; availability debounced at 500ms |
| Phone/address | Local state, mostly unconstrained | No | Remain local; validation belongs on blur/submit when a field has a real contract |
| UPI ID | Validated at explicit payment submission | No | No mutation on typing; inline payment validation remains submit-driven |
| Website/social URLs | Local draft in profile/customer-page forms | No | No change to draft behavior; browser format checks remain submit-driven where applicable |
| Menu price | Local draft, submitted from editor | No | No mutation on typing; validation remains explicit on save |
| Staff email | Local invite draft, submitted explicitly | No | No mutation on typing; server validates on invite submission |

## Rules now applied

- Input changes update local form state only.
- Required and format messages appear after blur or submit, never on the first keystroke.
- Authentication requests happen only on form submission.
- Authentication server errors clear as soon as the user edits a credential field.
- Slug format and slug availability are separate states.
- Slug availability waits 500ms, requires a locally valid slug, and ignores stale responses.
- Slug availability is the only new read exception to the no-keystroke-network rule, and it is debounced.

## Physical-device status

The production APK was rebuilt from the current working tree. TECNO KN3 installation and physical rapid-typing validation remain pending while no ADB device is connected; no physical PASS is claimed.

The device is now connected and the corrected production APK launches. Physical slug suggestion and submit-time invalid messaging were observed. Live availability feedback remains pending deployment of the local API route; authenticated login/profile/staff/payment cases remain unexecuted.
