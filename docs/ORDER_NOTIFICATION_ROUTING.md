# Order notification routing

Consumer orders are routed by the API when the order is created. The recipient is persisted on the outbox row, so delivery workers do not have to infer ownership later.

- If a dine-in order resolves to a table with an assigned non-owner team member, the first assignment receives the notification.
- If the table has no assigned team member, the location tenant's owner receives it.
- General notifications without a recipient continue to use the existing location-wide broadcast behavior.

The assignment is managed from the merchant Tables screen and is protected server-side. Only an owner or authorized manager can change assignments, and assignees must already be active members of the same tenant. Push delivery still depends on the recipient having an enabled device token and the existing outbox worker running.
