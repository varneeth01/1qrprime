# Store privacy/data-safety worksheet

This is an implementation worksheet, not a completed legal filing.

| Data                         | App use                         | Required?                   | Shared                           | Retention                              |
| ---------------------------- | ------------------------------- | --------------------------- | -------------------------------- | -------------------------------------- |
| Merchant email               | sign-in, recovery, verification | Yes                         | email provider only for recovery | account lifetime + audit window        |
| Merchant profile/menu        | public page and operations      | Yes for configured features | public when published            | merchant-controlled / retention policy |
| Orders and customer requests | fulfilment and support          | Optional by category        | merchant tenant                  | operational retention window           |
| Push token                   | new-order notification          | Optional                    | Expo/APNs/FCM delivery path      | until disabled or invalid              |
| Aggregate events             | analytics                       | Optional feature            | no advertising sharing           | 13 months                              |

The final Apple App Privacy answers and Google Data Safety form must be completed from the deployed processors and legal privacy policy. No advertising SDK or fingerprinting is used by this implementation.
