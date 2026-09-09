# Evently — Booking & Payment Architecture

## Modules 1–8: Complete Study & Interview Notes

---

# Table of Contents

1. Domain Model & State Machine
2. Booking & Inventory Reservation
3. Order & Idempotency Layer
4. Payment Provider Integration
5. Payment Webhook Processing
6. Payment Finalization Transaction
7. Reservation Expiry Worker
8. Delayed-Payment Recovery
9. Core Concepts Comparison
10. Complete End-to-End Flow
11. Interview Questions and Answers
12. Important Failure Scenarios
13. Final Interview Cheat Sheet

---

# MODULE 1 — Domain Model & State Machine

## 1. Why do we need domain models?

A booking/payment system contains multiple business concepts.

For Evently, the important entities are:

```text
EventShow
Reservation
Order
Payment
Ticket
```

Each entity represents a different business concept.

---

# 2. EventShow

`EventShow` represents a particular event/show with limited inventory.

Example:

```text
EventShow {
    id
    capacity
    reserved
    sold
}
```

Example:

```text
capacity = 100
reserved = 10
sold = 70
```

Therefore:

```text
available = capacity - reserved - sold

available = 100 - 10 - 70
available = 20
```

## Important invariant

```text
capacity = available + reserved + sold
```

Or:

```text
available = capacity - reserved - sold
```

This is an important business invariant.

---

# 3. Reservation

A `Reservation` represents a temporary hold on inventory.

Example:

```text
Reservation {
    id
    eventShowId
    quantity
    status
    expiresAt
}
```

Possible states:

```text
RESERVED
CONFIRMED
EXPIRED
```

Conceptually:

```text
RESERVED
   ├──→ CONFIRMED
   │
   └──→ EXPIRED
```

Meaning:

### RESERVED

Tickets are temporarily held.

The user has not necessarily completed payment yet.

### CONFIRMED

Payment and purchase finalization succeeded.

### EXPIRED

The temporary hold ended without normal successful completion.

The inventory should be released.

---

# 4. Order

An `Order` represents a purchase attempt.

Example:

```text
Order {
    id
    userId
    reservationId
    idempotencyKey
    status
}
```

Possible states:

```text
CREATED
PAYMENT_PENDING
PAID
REFUND_REQUIRED
```

The exact state names can vary depending on implementation.

The important idea is:

> An Order represents the business purchase attempt.

---

# 5. Payment

A `Payment` represents information about the money transaction.

Example:

```text
Payment {
    id
    orderId
    provider
    providerPaymentId
    status
}
```

Possible states might include:

```text
CREATED
CAPTURED
FAILED
```

The important principle:

> Payment state and Order state are related, but they represent different business concepts.

For example:

```text
Payment = CAPTURED
```

means:

> Money was successfully received.

But:

```text
Order = REFUND_REQUIRED
```

may mean:

> Money was received, but the system cannot fulfill the purchase.

This distinction becomes important in Module 8.

---

# 6. Ticket

A Ticket represents one unit of event access.

If a user buys:

```text
quantity = 3
```

we generally create:

```text
Ticket 1
Ticket 2
Ticket 3
```

rather than one ticket containing:

```text
quantity = 3
```

because each ticket may be independently checked in.

Ticket concepts are mainly covered in Modules 9 and 10.

---

# 7. Relationships

Conceptually:

```text
User
 │
 └── Order
       │
       ├── Reservation
       │
       └── Payment
             │
             └── Provider Payment

Order
 │
 └── Ticket(s)
```

A clean design should avoid unnecessary duplication.

For example, if:

```text
Order → reservationId
```

already establishes the relationship, we do not necessarily need:

```text
Reservation → orderId
```

unless there is a clear reason.

## Principle

> Prefer a clear single source of truth over unnecessary duplicated relationships.

---

# 8. State Machines

A state machine defines valid state transitions.

Example:

```text
AVAILABLE
    ↓
RESERVED
    ├──→ SOLD / CONFIRMED
    │
    └──→ EXPIRED
             ↓
         AVAILABLE
```

State machines are useful because they prevent arbitrary transitions.

For example:

```text
RESERVED → CONFIRMED
```

may be valid.

But:

```text
EXPIRED → CONFIRMED
```

should not necessarily be blindly allowed.

Why?

Because expiry may already have released inventory.

---

# Module 1 — Key Principle

> Separate entities based on business responsibility and define explicit state transitions.

---

# MODULE 1 — INTERVIEW QUESTIONS

## Q1. Why do we need separate Reservation, Order, and Payment entities?

### Answer

They represent different business concepts.

```text
Reservation
→ temporary inventory hold

Order
→ purchase attempt

Payment
→ money transaction
```

Combining all of them into one object makes state management and failure handling difficult.

For example:

```text
Reservation may expire

Payment may succeed

Order may require a refund
```

These are different business facts.

---

## Q2. Why use explicit states instead of boolean fields?

### Answer

Explicit states communicate the current business situation clearly.

Compare:

```text
isPaid = true
```

with:

```text
Payment = CAPTURED
Order = REFUND_REQUIRED
```

The second design contains much more meaningful information.

Explicit states also help define valid transitions.

---

## Q3. What is an invariant?

### Answer

An invariant is a condition that should always remain true.

For inventory:

```text
available = capacity - reserved - sold
```

The system must preserve this relationship.

---

## Q4. Why is state transition design important?

### Answer

Because business operations have valid and invalid transitions.

For example:

```text
RESERVED → CONFIRMED
```

may be valid.

But allowing arbitrary transitions can create inconsistent business states.

State machines make the lifecycle explicit.

---

# MODULE 2 — BOOKING & INVENTORY RESERVATION

# 1. The problem

Suppose an event has:

```text
capacity = 2
reserved = 0
sold = 0

available = 2
```

Two users attempt to book two tickets simultaneously.

A naive application flow might be:

```text
Read inventory
     ↓
Check available >= quantity
     ↓
If yes
     ↓
Update inventory
```

This creates a race condition.

---

# 2. Race condition

Suppose:

```text
available = 2
```

Two users request:

```text
User A wants 2
User B wants 2
```

Timeline:

```text
User A reads available = 2

User B reads available = 2

User A decides booking is possible

User B decides booking is possible

User A updates

User B updates
```

Both requests made their decision based on stale information.

Potential result:

```text
reserved = 4
```

when capacity was only:

```text
2
```

This is overselling.

---

# 3. Solution — Atomic Conditional Update

The availability check and inventory modification must happen together at the database level.

Conceptually:

```text
UPDATE EventShow

ONLY IF:

capacity - reserved - sold >= quantity

THEN:

reserved += quantity
```

The important point is:

```text
CHECK CONDITION
+
UPDATE
```

happen as one atomic database operation.

---

# 4. Why application-level checks are dangerous

Bad pattern:

```text
available = database.read()

if available >= quantity:
    database.update()
```

There is a race window between:

```text
READ
```

and:

```text
UPDATE
```

Another request can modify inventory during that period.

The correct pattern is conceptually:

```text
findOneAndUpdate(
    condition = inventory available,
    update = reserve inventory
)
```

The condition and update belong to the same database operation.

---

# 5. What if two requests arrive at MongoDB at the same time?

Conceptually, both may reach the database concurrently.

MongoDB handles conflicting writes internally.

The application should not depend on:

```text
"I checked first, therefore I own the inventory."
```

Instead, each operation says:

```text
Perform this update only if the condition is still true.
```

Example:

```text
Request A:
Reserve 2 if available >= 2

Request B:
Reserve 2 if available >= 2
```

Only operations whose condition remains valid can successfully consume the inventory.

---

# 6. Reservation creation

After successfully reserving inventory, we need a Reservation.

Example:

```text
Reservation {
    eventShowId
    quantity
    status = RESERVED
    expiresAt
}
```

Example:

```text
expiresAt = now + 10 minutes
```

This creates a temporary hold.

---

# 7. Why reservation exists

Without reservation:

```text
User clicks Book
      ↓
Inventory immediately considered permanently sold
```

But the user has not paid.

We need:

```text
AVAILABLE
    ↓
RESERVED
```

This means:

> The user temporarily owns the right to complete payment for these tickets.

---

# 8. Booking Transaction

A booking operation may involve:

```text
1. Reserve inventory
2. Create Reservation
3. Create Order
```

These operations represent one logical business operation.

Therefore, they should be protected by a database transaction where appropriate.

Conceptually:

```text
BEGIN TRANSACTION

    Reserve inventory atomically

    Create Reservation

    Create Order

COMMIT
```

If any operation fails:

```text
ROLLBACK
```

---

# 9. Why Atomic Update Alone Is Not Enough

Atomic inventory update protects:

```text
Shared inventory
```

But the complete booking operation may contain multiple database changes.

Example:

```text
Inventory reserved ✅

Reservation created ✅

Order creation fails ❌
```

Without a transaction:

```text
Inventory remains reserved
```

even though no valid order exists.

Therefore:

```text
Atomic update
```

and:

```text
Transaction
```

solve different problems.

---

# Module 2 — Key Principle

> Use database-level atomic conditional updates when multiple requests compete for limited shared inventory.

---

# MODULE 2 — INTERVIEW QUESTIONS

## Q1. Why is this code unsafe?

```text
if (available >= quantity) {
    reserve();
}
```

### Answer

Because the check and update are separate operations.

Multiple concurrent requests can read the same availability before any update occurs.

This creates a race condition.

---

## Q2. Why does an atomic conditional update solve the race?

### Answer

Because the database evaluates the condition and performs the update as one atomic operation.

There is no application-level gap between:

```text
check availability
```

and:

```text
update inventory
```

The operation succeeds only if the condition is valid at execution time.

---

## Q3. Can two requests reach MongoDB at the same time?

### Answer

Yes.

The important application design is that we do not rely on application-level timing.

We send a conditional update such as:

```text
Reserve inventory only if enough inventory is still available.
```

MongoDB handles conflicting database operations internally.

The application observes whether its conditional update succeeded.

---

## Q4. Why is a transaction needed if the inventory update is already atomic?

### Answer

Atomic inventory update protects one shared resource.

But the booking operation includes multiple related changes.

For example:

```text
Inventory reservation
+
Reservation document
+
Order document
```

If one operation succeeds and another fails, the database may become inconsistent.

A transaction provides all-or-nothing behavior.

---

## Q5. What is the difference between concurrency and idempotency?

### Answer

Concurrency asks:

> What happens when different operations occur simultaneously?

Example:

```text
User A and User B compete for the last ticket.
```

Idempotency asks:

> What happens when the same logical operation is repeated?

Example:

```text
The same booking request is sent twice.
```

---

# MODULE 3 — ORDER & IDEMPOTENCY LAYER

# 1. The problem

Suppose the user clicks:

```text
BOOK
```

The backend receives the request.

But then:

```text
Network timeout
```

The frontend does not know whether the backend completed the operation.

So it retries.

Now:

```text
Request 1
```

and:

```text
Request 2
```

represent the same logical user action.

Without protection:

```text
Two orders may be created.
```

---

# 2. Idempotency

Idempotency means:

> Repeating the same logical operation should not create multiple final effects.

For example:

```text
User clicks Book once

Network timeout occurs

Frontend retries the same request
```

The retry should not create:

```text
Order 1
Order 2
```

It should represent the same logical operation.

---

# 3. Idempotency Key

The client generates or receives an idempotency key.

Example:

```text
Idempotency-Key: abc123
```

Both retries use:

```text
abc123
```

Conceptually:

```text
Same logical work
        ↓
Same idempotency key
```

---

# 4. Why must retries use the same key?

Suppose:

```text
Request 1 → key A
Request 2 → key B
```

The backend may think:

```text
These are two different logical operations.
```

Then both could be processed independently.

Therefore:

> The same logical operation must use the same idempotency key.

---

# 5. Database Uniqueness Constraint

Application-level checks are not enough.

Unsafe approach:

```text
Check whether key exists

If not:
    create Order
```

Two simultaneous requests may both see:

```text
Key does not exist.
```

Then both attempt to create an order.

Instead, enforce uniqueness at the database level.

Example conceptually:

```text
UNIQUE(userId, idempotencyKey)
```

or another appropriate uniqueness design.

---

# 6. Why database constraint matters

Timeline:

```text
Request A checks key
→ does not exist

Request B checks key
→ does not exist

Request A inserts Order

Request B inserts Order
```

Without uniqueness:

```text
Duplicate Order
```

With a unique constraint:

```text
One insert succeeds

The other receives duplicate key conflict
```

---

# 7. Idempotent Response

Suppose:

```text
Request 1 succeeds
```

But:

```text
Backend crashes before sending response
```

The client retries.

The backend sees the same idempotency key.

Instead of creating another order, it can return the existing result.

Conceptually:

```text
Same idempotency key
       ↓
Existing Order found
       ↓
Return existing Order/result
```

---

# 8. Exactly-once vs Idempotency

Distributed systems contain uncertainty:

* Network timeout
* Server crash
* Retry
* Duplicate delivery
* Response loss

Trying to guarantee:

```text
Exactly once delivery
```

is difficult and fragile.

A better engineering principle is:

> Assume operations may be delivered multiple times and make duplicate processing safe.

This is where idempotency helps.

---

# Module 3 — Key Principle

> Do not depend on requests being delivered exactly once. Make duplicate processing safe.

---

# MODULE 3 — INTERVIEW QUESTIONS

## Q1. Why can't Module 2 atomic inventory reservation solve duplicate requests?

### Answer

Module 2 solves concurrent access to shared inventory.

Idempotency solves repeated execution of the same logical operation.

Example:

```text
Different users booking simultaneously
→ concurrency problem

Same request retried
→ idempotency problem
```

They are different problems.

---

## Q2. Why is an application-level idempotency check not enough?

### Answer

Because two identical requests may simultaneously check:

```text
Key does not exist.
```

Both could proceed.

A database uniqueness constraint provides final enforcement.

---

## Q3. What happens if the first request commits but the backend crashes before responding?

### Answer

The client may retry with the same idempotency key.

The backend finds the existing operation/result and returns it.

It does not create another order.

---

## Q4. Why should the same logical operation use the same idempotency key?

### Answer

Because the key identifies one logical unit of work.

Using a different key makes the backend interpret the request as new work.

---

## Q5. Transaction vs unique constraint?

### Answer

Transaction:

> Ensures multiple related operations succeed or fail together.

Unique constraint:

> Ensures a value/combination cannot be duplicated.

They solve different problems.

---

# MODULE 4 — PAYMENT PROVIDER INTEGRATION

# 1. Why use an external payment provider?

Payment providers handle complex external payment infrastructure such as:

* Banks
* Cards
* UPI
* Payment authorization
* Payment processing

Our backend should not directly attempt to manage all banking infrastructure.

Instead:

```text
Evently Backend
        ↓
Payment Provider
        ↓
Bank / UPI / Card Networks
```

---

# 2. Normal Flow

After booking:

```text
Inventory reserved
       ↓
Reservation created
       ↓
Order created
       ↓
Create provider-side payment order
       ↓
User completes checkout
```

The provider gives us a provider-side payment reference.

Example:

```text
providerOrderId
```

---

# 3. Why create a provider-side payment order?

The provider needs to know about the payment attempt.

Conceptually:

```text
Our Order
     ↓
Create Provider Payment Order
     ↓
Provider Order ID
     ↓
Frontend starts provider checkout
```

---

# 4. Why should external provider calls not be inside a database transaction?

Suppose:

```text
BEGIN DATABASE TRANSACTION

Call Payment Provider over network
```

The external call may involve:

* Network latency
* Network failure
* Provider delay
* Provider timeout

Holding a database transaction open while waiting for an external system is undesirable.

Also:

> The payment provider does not participate in our MongoDB transaction.

We cannot truly make:

```text
MongoDB transaction
+
External payment
```

one single atomic transaction.

---

# 5. Correct Mental Model

Database transactions protect our database.

They do not automatically control external systems.

Therefore:

```text
Create/prepare local state
       ↓
Commit local transaction if required
       ↓
Call external provider
       ↓
External provider performs payment work
```

The final payment truth later comes through authoritative provider communication.

---

# 6. Payment Initiation Is Not Payment Success

This is extremely important.

Suppose:

```text
Frontend opens payment checkout
```

This does not mean:

```text
Payment = SUCCESS
```

It only means:

```text
Payment process started.
```

The user may:

* Cancel
* Fail payment
* Close browser
* Lose network

Therefore:

> Starting payment and confirming payment are separate stages.

---

# Module 4 — Key Principle

> External systems should not be treated as participants in your database transaction.

---

# MODULE 4 — INTERVIEW QUESTIONS

## Q1. Why use a payment provider?

### Answer

Payment providers handle complex payment infrastructure and interactions with banking/payment networks.

Our application focuses on business logic and integrates with the provider.

---

## Q2. Why should we not keep a database transaction open during a provider API call?

### Answer

The provider is an external system with unpredictable latency and failures.

Also, it cannot participate in our MongoDB transaction.

Holding a database transaction open while waiting for an external network operation is undesirable.

---

## Q3. Does successfully starting checkout mean payment succeeded?

### Answer

No.

It only means payment processing was initiated.

The authoritative confirmation comes later.

---

## Q4. Can our database transaction roll back a successful bank payment?

### Answer

No.

The bank/provider is an external system.

Our local transaction only controls our database.

This is why distributed systems need reconciliation and compensation logic.

---

# MODULE 5 — PAYMENT WEBHOOK PROCESSING

# 1. The problem

After the user completes payment, how does Evently know whether money was actually received?

We should not blindly trust:

```text
Frontend says:
"Payment successful"
```

The frontend is not the authoritative source.

---

# 2. Why not trust the frontend?

A client request can be manipulated.

A malicious user could send:

```text
paymentSuccess = true
```

That does not prove money was actually received.

Therefore:

> The client cannot be the final authority for payment success.

---

# 3. Payment Provider Webhook

The provider independently sends information to our backend.

Conceptually:

```text
User pays
      ↓
Payment Provider
      ↓
Provider confirms payment
      ↓
Webhook to Evently backend
```

The provider communicates directly with our backend.

---

# 4. Webhook Verification

We must verify the webhook.

Depending on the provider, verification may involve:

* Signature verification
* Secret verification
* Provider payment reference verification

The important principle:

> Do not blindly trust incoming webhook data.

We must establish that the webhook genuinely came from the payment provider.

---

# 5. Webhook Processing Flow

Conceptually:

```text
Webhook arrives
      ↓
Verify authenticity
      ↓
Extract provider payment information
      ↓
Identify local order/payment
      ↓
Process payment finalization
```

---

# 6. Why Webhooks Must Be Idempotent

Providers may retry webhooks.

Possible reasons:

* Our server timed out
* Our server crashed
* Provider did not receive HTTP 200
* Network failure

Therefore:

```text
Same payment webhook
```

may arrive multiple times.

Processing must be safe.

---

# 7. Webhook Idempotency

Suppose:

```text
Payment P1
```

was already processed.

A duplicate webhook arrives.

The system should not:

```text
Create another Payment

Create tickets again

Sell inventory again
```

Duplicate processing must safely produce no additional business effect.

---

# Module 5 — Key Principle

> Payment success must come from an authoritative source, and webhook processing must be idempotent.

---

# MODULE 5 — INTERVIEW QUESTIONS

## Q1. Why don't you trust the frontend for payment confirmation?

### Answer

Client-side requests can be manipulated and do not prove that money was actually received.

The payment provider is the authoritative source.

---

## Q2. Why verify the webhook?

### Answer

Because an attacker could attempt to send a fake request pretending to be the payment provider.

Verification establishes authenticity.

---

## Q3. Why can the same webhook arrive multiple times?

### Answer

Distributed systems have unreliable communication.

The provider may retry because:

* Our server crashed
* A response was lost
* A timeout occurred
* The provider did not receive acknowledgment

Therefore duplicate delivery must be expected.

---

## Q4. What happens if your backend commits payment processing but crashes before returning HTTP 200?

### Answer

The provider may resend the webhook.

The duplicate webhook must be handled idempotently.

The backend detects that the payment was already processed and safely returns success/acknowledgment without processing it again.

---

# MODULE 6 — PAYMENT FINALIZATION TRANSACTION

# 1. The problem

Payment is now confirmed.

We need to perform several related operations:

```text
Payment → CAPTURED

Order → PAID

Reservation → CONFIRMED

Inventory:
RESERVED → SOLD

Create Ticket(s)
```

These operations represent one logical business operation.

---

# 2. Why transaction?

Suppose we do operations independently:

```text
Payment → CAPTURED ✅

Order → PAID ✅

Reservation → CONFIRMED ❌

Server crashes 💥
```

Now the database contains a partially completed purchase.

That is inconsistent.

Therefore:

```text
BEGIN TRANSACTION

    Update Payment
    Update Order
    Update Reservation

    reserved -= quantity
    sold += quantity

    Create Tickets

COMMIT
```

If something fails:

```text
ROLLBACK
```

---

# 3. Inventory Transition

Normal payment flow:

```text
AVAILABLE
    ↓
RESERVED
    ↓
SOLD
```

At finalization:

```text
reserved -= quantity
sold += quantity
```

This preserves the inventory invariant.

Example:

Before:

```text
capacity = 100
reserved = 10
sold = 50

available = 40
```

Two reserved tickets are purchased.

After:

```text
reserved = 8
sold = 52

available = 40
```

Notice:

```text
available remains unchanged.
```

The tickets were already unavailable because they were reserved.

We are simply changing:

```text
RESERVED → SOLD
```

---

# 4. Transaction Alone Is Not Enough

Suppose two webhook processing attempts occur simultaneously.

Application logic:

```text
Check if payment exists

If not:
    create Payment
```

Both requests may see:

```text
Payment does not exist.
```

Therefore, application-level checks alone are unsafe.

We also need database constraints where uniqueness matters.

For example:

```text
UNIQUE(providerPaymentId)
```

---

# 5. Transaction + Unique Constraint

Transaction solves:

```text
All related changes succeed together.
```

Unique constraint solves:

```text
Duplicate records cannot exist.
```

They work together.

---

# 6. What if transaction rolls back?

Suppose:

```text
Webhook arrives
      ↓
Transaction begins
      ↓
Payment processing partially executes
      ↓
Error occurs
      ↓
ROLLBACK
```

The database returns to the previous committed state.

Later:

```text
Webhook retry
```

can safely attempt processing again.

Because the previous transaction did not commit, the business operation was not finalized.

---

# 7. What triggers the retry?

The payment provider may retry the webhook if it did not receive a successful acknowledgment.

However, the system should also be designed so processing is safe if retries occur.

Important principle:

> Do not depend only on a single request being delivered once.

---

# 8. Commit Happens But HTTP 200 Is Lost

Timeline:

```text
Webhook arrives

Transaction begins

Transaction COMMIT succeeds

Backend crashes before HTTP 200
```

The provider retries.

Now:

```text
Payment already finalized.
```

The duplicate webhook should not redo the operation.

It should detect the existing finalized state and safely acknowledge.

---

# 9. Atomic Update vs Transaction vs Unique Constraint

This is extremely important.

## Atomic Update

Protects a single conditional state/resource modification.

Example:

```text
Reserve inventory only if enough exists.
```

---

## Transaction

Protects consistency across multiple related database operations.

Example:

```text
Payment
+
Order
+
Reservation
+
Inventory
+
Tickets
```

All succeed or all roll back.

---

## Unique Constraint

Enforces uniqueness.

Example:

```text
One provider payment ID
```

cannot create multiple payment records.

---

# Module 6 — Key Principle

> Payment finalization is one logical business operation and should commit atomically as a transaction.

---

# MODULE 6 — INTERVIEW QUESTIONS

## Q1. Why not update Payment, Order, Reservation, and Inventory separately?

### Answer

Because a failure in the middle can leave a partially completed purchase.

These operations are logically connected.

A transaction ensures all-or-nothing behavior.

---

## Q2. Why isn't a transaction enough to prevent duplicate payments?

### Answer

A transaction provides atomicity across operations.

It does not automatically enforce uniqueness across independent concurrent attempts.

A database uniqueness constraint is needed where duplicates must be impossible.

---

## Q3. What happens if ticket creation fails inside finalization?

### Answer

The transaction should roll back.

Otherwise:

```text
Payment = captured
Order = paid
Inventory = sold
Tickets = missing
```

That would be inconsistent.

---

## Q4. What happens if the transaction rolls back?

### Answer

No partial state should remain committed.

A later retry can attempt the same operation again.

---

## Q5. What happens if commit succeeds but the webhook response is lost?

### Answer

The provider may resend the webhook.

The duplicate webhook must be processed idempotently.

The system recognizes the operation as already finalized and does not create duplicate effects.

---

## Q6. What does each mechanism solve?

### Answer

```text
Atomic conditional update
→ shared resource concurrency

Transaction
→ all-or-nothing multi-operation consistency

Unique constraint
→ duplicate prevention

Idempotency
→ repeated logical requests produce one final effect
```

---

# MODULE 7 — RESERVATION EXPIRY WORKER

# 1. The problem

A user may reserve tickets and never pay.

Example:

```text
capacity = 100

User reserves 2

reserved = 2
```

Then the user:

```text
Closes browser
Never pays
```

If the reservation remains forever:

```text
reserved inventory remains blocked forever.
```

Eventually the event could appear sold out even though nobody paid.

---

# 2. Temporary Reservation

Reservations should have an expiration time.

Example:

```text
Reservation {
    status = RESERVED
    expiresAt = 10:10 AM
}
```

If payment does not complete before expiration:

```text
RESERVED → EXPIRED
```

and inventory is released.

---

# 3. Reservation Expiry Worker

A worker runs independently of user requests.

Conceptually:

```text
Worker wakes up
      ↓
Find reservations where:

status = RESERVED

AND

expiresAt <= now
```

For each expired reservation:

```text
Expire reservation
      +
Release inventory
```

---

# 4. Why Worker?

No user may send a request after abandoning checkout.

Therefore, something must independently detect:

```text
Time expired.
```

A background worker performs this work.

---

# 5. Expiry Transaction

Conceptually:

```text
BEGIN TRANSACTION

    Reservation:
    RESERVED → EXPIRED

    Inventory:
    reserved -= quantity

COMMIT
```

Both operations belong together.

---

# 6. Why Transaction?

Bad scenario:

```text
Reservation → EXPIRED ✅

Server crashes 💥

Inventory not released ❌
```

Now the reservation says:

```text
EXPIRED
```

but inventory still says:

```text
reserved
```

Inconsistent.

The opposite is also dangerous:

```text
Inventory released

Server crashes

Reservation still RESERVED
```

Therefore:

```text
Expire reservation
+
Release inventory
```

must succeed together.

---

# 7. Worker Idempotency

Workers can:

* Run repeatedly
* Retry
* Crash and restart
* Have multiple instances

Therefore, expiration must be safe to retry.

Example:

```text
First attempt:

RESERVED → EXPIRED
Release inventory
```

Later:

```text
Second attempt:

Already EXPIRED
→ Do nothing
```

---

# 8. Expiry vs Payment Race

Suppose:

```text
Reservation expires at 10:10
```

At approximately the same time:

```text
Expiry Worker:
RESERVED → EXPIRED
```

and:

```text
Payment Finalization:
RESERVED → CONFIRMED
```

Both compete to transition the same reservation.

---

# 9. Conditional State Transition

Expiry worker conceptually says:

```text
Change to EXPIRED

ONLY IF

status is still RESERVED
```

Payment finalization conceptually says:

```text
Change to CONFIRMED

ONLY IF

status is still RESERVED
```

This prevents both operations from blindly assuming the earlier state.

---

# 10. Why this is important

Unsafe pattern:

```text
Worker reads RESERVED

Payment reads RESERVED

Worker writes EXPIRED

Payment writes CONFIRMED
```

Both decisions were based on stale reads.

Instead:

```text
RESERVED → EXPIRED
```

or:

```text
RESERVED → CONFIRMED
```

should be a conditional state transition.

---

# 11. Transaction + Conditional Transition

Conditional update answers:

> Is this reservation still eligible for this transition?

Transaction answers:

> If I perform this transition, can all related changes commit together?

Therefore:

```text
Conditional State Transition
+
Transaction
```

work together.

---

# Module 7 — Key Principle

> Temporary ownership of scarce resources must eventually expire, and expiration must be safe under retries and concurrent state changes.

---

# MODULE 7 — INTERVIEW QUESTIONS

## Q1. Why do reservations need expiration?

### Answer

Without expiration, abandoned reservations could permanently block inventory.

Eventually inventory could appear unavailable even though no purchase occurred.

---

## Q2. Why use a background worker?

### Answer

Reservation expiration is time-based and may happen without another user request.

A background worker independently finds and processes expired reservations.

---

## Q3. Why is a transaction needed during expiry?

### Answer

Because:

```text
Reservation → EXPIRED
```

and:

```text
Release inventory
```

represent one logical operation.

A failure between them could leave inconsistent state.

---

## Q4. Can multiple worker instances process the same expired reservation?

### Answer

Potentially yes.

Therefore processing must be safe.

The worker should only expire a reservation if it is still in the expected state.

Once one worker transitions it:

```text
RESERVED → EXPIRED
```

later attempts should observe that it is no longer eligible and do nothing.

---

## Q5. What happens if expiry and payment finalization happen simultaneously?

### Answer

They compete for the same state transition.

Both should condition their operation on:

```text
status = RESERVED
```

Only a valid transition should succeed.

However, if payment succeeds after expiry, we have a separate business recovery problem.

That leads to Module 8.

---

# MODULE 8 — DELAYED-PAYMENT RECOVERY

# 1. The problem

Payment systems and reservation systems are independent.

A payment may complete close to the reservation expiration boundary.

Example timeline:

```text
10:09:59

User completes payment
```

The provider processes payment.

Then:

```text
10:10:00

Reservation expires
```

Expiry worker performs:

```text
RESERVED → EXPIRED

Release inventory
```

Then:

```text
10:10:05

Payment webhook arrives

PAYMENT CAPTURED
```

Now:

```text
Money received ✅

Reservation expired ❌

Inventory released ❌
```

This is delayed-payment recovery.

---

# 2. Why can't we blindly create tickets?

Because payment success does not guarantee inventory availability.

Timeline:

```text
User A reserves last 2 tickets
        ↓
Reservation expires
        ↓
Inventory released
        ↓
User B reserves/buys those tickets
        ↓
Available = 0
        ↓
User A's delayed payment arrives
```

If we simply create tickets for User A:

```text
Capacity may be exceeded.
```

We oversell.

Therefore:

> Payment success and fulfillment availability are separate facts.

---

# 3. Recovery Flow

When a verified captured payment arrives:

```text
Is reservation still active?
```

## Case A

```text
Reservation still RESERVED
```

Use normal payment finalization.

---

## Case B

```text
Reservation already EXPIRED
```

We must check whether inventory can still be acquired.

Conceptually:

```text
Is enough inventory currently available?
```

---

# 4. If Inventory Is Available

Suppose:

```text
available = 2
```

Delayed payment needs:

```text
quantity = 2
```

We must atomically acquire the inventory.

This is the same shared-inventory concurrency pattern from Module 2.

Conceptually:

```text
ONLY IF:

available >= quantity

THEN:

sold += quantity
```

---

# 5. State Transition

Normal flow:

```text
AVAILABLE
    ↓
RESERVED
    ↓
SOLD
```

Delayed payment recovery is different.

The original reservation already expired:

```text
RESERVED
    ↓
EXPIRED
    ↓
AVAILABLE
```

Now payment is already confirmed.

We do not need another temporary pre-payment hold.

Therefore, conceptually:

```text
AVAILABLE → SOLD
```

directly.

---

# 6. Why not AVAILABLE → RESERVED → SOLD again?

Because `RESERVED` represents:

> Temporary ownership while payment is not yet confirmed.

In delayed recovery:

```text
Payment is already confirmed.
```

We only need to determine whether the order can still be fulfilled.

Therefore:

```text
AVAILABLE
      ↓
Atomic inventory acquisition
      ↓
SOLD
```

---

# 7. Concurrent Recovery vs New Booking

Suppose:

```text
available = 2
```

At the same time:

```text
Delayed Payment Recovery wants 2 tickets
```

and:

```text
New User wants to reserve 2 tickets
```

Both compete for the same inventory.

We need:

```text
Atomic conditional update
```

Delayed recovery:

```text
If enough inventory exists:
    sold += 2
```

Normal booking:

```text
If enough inventory exists:
    reserved += 2
```

Only valid conditional operations can consume the limited inventory.

---

# 8. If Inventory Is Not Available

Suppose:

```text
Payment = CAPTURED
```

but:

```text
available = 0
```

We cannot create tickets.

Instead:

```text
Order → REFUND_REQUIRED
```

and:

```text
Do not create tickets.
```

---

# 9. Why REFUND_REQUIRED Instead of FAILED?

`FAILED` may imply:

```text
Payment did not succeed.
```

For example:

```text
Card declined
UPI failed
User cancelled
```

But in delayed-payment recovery:

```text
Money was received.
```

The problem is:

```text
System cannot fulfill the order.
```

Therefore:

```text
REFUND_REQUIRED
```

communicates:

```text
Payment succeeded

BUT

Fulfillment failed

AND

Action is required
```

---

# 10. Compensation

The external payment already happened.

Our local system cannot simply undo the fact that money was received.

If fulfillment is impossible:

```text
Money received
      ↓
Cannot fulfill
      ↓
Compensating action
      ↓
Refund
```

This is a common distributed systems pattern.

---

# 11. General Principle

Distributed systems may contain independently successful operations.

Example:

```text
External Payment = SUCCESS

Local fulfillment = FAILURE
```

Instead of pretending everything succeeded or failed together, the system models the real situation.

For example:

```text
REFUND_REQUIRED
```

Then a compensating action can resolve the situation.

---

# Module 8 — Key Principle

> Payment success and successful fulfillment are separate facts. When external effects cannot be rolled back locally, recovery and compensation logic are required.

---

# MODULE 8 — INTERVIEW QUESTIONS

## Q1. Why can delayed payment happen?

### Answer

Payment provider processing and webhook delivery occur independently of reservation expiry.

A payment can complete close to the expiration boundary, while the webhook arrives after inventory was released.

---

## Q2. Why not simply confirm the expired reservation?

### Answer

Because expiry may already have released inventory.

That inventory may have been consumed by another user.

Blindly confirming the old reservation could oversell.

---

## Q3. What should happen when payment arrives after expiry?

### Answer

Check whether inventory can still be safely acquired.

If yes:

```text
Atomically acquire inventory
→ fulfill order
→ create tickets
```

If no:

```text
Order → REFUND_REQUIRED
```

and do not create tickets.

---

## Q4. What state transition happens during delayed recovery?

### Answer

Conceptually:

```text
AVAILABLE → SOLD
```

because payment is already confirmed.

There is no need for another temporary pre-payment `RESERVED` state.

---

## Q5. What if a new user and delayed payment recovery compete for the same inventory?

### Answer

Use an atomic conditional inventory update.

Both operations compete for currently available inventory.

The database operation must check availability and modify inventory atomically.

---

## Q6. Why can't we create tickets anyway if the customer genuinely paid?

### Answer

Because payment does not create physical/event inventory.

The inventory may already have been sold to another user.

Creating tickets anyway could exceed capacity and oversell the event.

---

## Q7. Why is REFUND_REQUIRED better than FAILED?

### Answer

Because it accurately represents the business situation:

```text
Payment succeeded

Fulfillment failed
```

It also communicates the required next action:

```text
Refund customer
```

---

# CORE CONCEPTS — IMPORTANT COMPARISON

# 1. Atomic Conditional Update

Used for:

```text
Limited shared resources
```

Example:

```text
Reserve tickets only if enough inventory exists.
```

Solves:

```text
Race conditions around shared inventory.
```

---

# 2. Transaction

Used for:

```text
Multiple related database operations.
```

Example:

```text
Payment update
+
Order update
+
Reservation update
+
Inventory update
+
Ticket creation
```

Solves:

```text
Partial completion and inconsistent database state.
```

---

# 3. Unique Constraint

Used for:

```text
Preventing duplicates.
```

Example:

```text
UNIQUE(providerPaymentId)
```

or:

```text
UNIQUE(userId, idempotencyKey)
```

Solves:

```text
Duplicate records.
```

---

# 4. Idempotency

Used for:

```text
Repeated logical operations.
```

Example:

```text
Same request retried.
```

Desired behavior:

```text
Many attempts
        ↓
One logical final effect
```

---

# 5. Webhook

Used for:

```text
Authoritative external payment confirmation.
```

The frontend is not the final source of truth.

---

# 6. Compensation

Used when:

```text
External action succeeded

BUT

Local fulfillment cannot complete.
```

Example:

```text
Money captured

Inventory unavailable

→ Refund
```

---

# COMPLETE END-TO-END EVENTLY FLOW

# STEP 1 — User Books

```text
User
 ↓
POST /booking
```

Backend receives:

```text
eventShowId
quantity
idempotencyKey
```

---

# STEP 2 — Check Idempotency

Conceptually:

```text
Is this idempotency key already associated with an existing operation?
```

If yes:

```text
Return existing result.
```

If no:

```text
Continue.
```

Database uniqueness provides final protection against concurrent duplicates.

---

# STEP 3 — Begin Booking Transaction

Conceptually:

```text
BEGIN TRANSACTION
```

---

# STEP 4 — Atomically Reserve Inventory

Conceptually:

```text
Reserve quantity

ONLY IF:

available >= quantity
```

Transition:

```text
AVAILABLE → RESERVED
```

If insufficient inventory:

```text
Booking fails.
```

---

# STEP 5 — Create Reservation

Example:

```text
status = RESERVED
expiresAt = now + 10 minutes
```

---

# STEP 6 — Create Order

Create the purchase attempt.

Store the idempotency relationship.

---

# STEP 7 — Commit Booking

```text
COMMIT
```

At this point:

```text
Inventory = RESERVED

Reservation = RESERVED

Order exists
```

---

# STEP 8 — Create Provider Payment Order

Backend communicates with the payment provider.

Conceptually:

```text
Evently Order
      ↓
Provider Payment Order
      ↓
Provider Order ID
```

---

# STEP 9 — User Completes Payment

```text
User
 ↓
Payment Provider
 ↓
Bank / UPI / Card
```

The frontend is not authoritative.

---

# STEP 10 — Provider Sends Webhook

```text
Payment Provider
        ↓
Webhook
        ↓
Evently Backend
```

---

# STEP 11 — Verify Webhook

Verify:

```text
Is this webhook genuinely from the provider?
```

Do not blindly trust incoming requests.

---

# STEP 12 — Payment Finalization

If reservation is still active:

```text
BEGIN TRANSACTION

Payment → CAPTURED

Order → PAID

Reservation → CONFIRMED

reserved -= quantity
sold += quantity

Create Tickets

COMMIT
```

Inventory transition:

```text
RESERVED → SOLD
```

---

# STEP 13 — Duplicate Webhook

If the provider sends the webhook again:

```text
Payment already processed.
```

The system:

```text
Does not duplicate payment processing.

Does not duplicate tickets.

Does not sell inventory again.
```

---

# STEP 14 — Reservation Expiry

If the user never completes payment:

```text
Expiry Worker
       ↓
Find expired RESERVED reservations
       ↓
BEGIN TRANSACTION

RESERVED → EXPIRED

Release inventory

COMMIT
```

Transition:

```text
RESERVED → AVAILABLE
```

---

# STEP 15 — Delayed Payment

If payment arrives after expiry:

```text
Payment verified
      ↓
Reservation already EXPIRED
      ↓
Check current inventory
```

If inventory exists:

```text
Atomic acquisition

AVAILABLE → SOLD

Finalize order
Create tickets
```

If inventory does not exist:

```text
Order → REFUND_REQUIRED

No tickets created.
```

---

# MASTER STATE FLOW

```text
                    ┌──────────────┐
                    │  AVAILABLE   │
                    └──────┬───────┘
                           │
                    User books
                           │
                           ▼
                    ┌──────────────┐
                    │   RESERVED   │
                    └──────┬───────┘
                           │
             ┌─────────────┴──────────────┐
             │                            │
        Payment succeeds               Time expires
             │                            │
             ▼                            ▼
      ┌──────────────┐             ┌──────────────┐
      │     SOLD     │             │   EXPIRED    │
      └──────────────┘             └──────┬───────┘
                                           │
                                   Release inventory
                                           │
                                           ▼
                                      AVAILABLE
                                           │
                                  Delayed payment?
                                           │
                              ┌────────────┴────────────┐
                              │                         │
                        Inventory exists           No inventory
                              │                         │
                              ▼                         ▼
                            SOLD               REFUND_REQUIRED
```

---

# IMPORTANT FAILURE SCENARIOS

# 1. Two Users Book Last Ticket

```text
User A
User B
```

Both want the last ticket.

Solution:

```text
Atomic conditional inventory update.
```

---

# 2. Same Request Sent Twice

Cause:

```text
Network timeout
```

Solution:

```text
Idempotency key
+
Database uniqueness
```

---

# 3. Inventory Reserved but Order Creation Fails

Solution:

```text
Transaction rollback.
```

---

# 4. User Starts Payment but Closes Browser

Solution:

```text
Reservation expiry.
```

---

# 5. Frontend Claims Payment Success

Solution:

```text
Do not trust frontend.

Wait for verified provider confirmation.
```

---

# 6. Fake Webhook

Solution:

```text
Webhook verification.
```

---

# 7. Duplicate Webhook

Solution:

```text
Idempotent webhook processing.
```

---

# 8. Transaction Rolls Back During Payment Finalization

Solution:

```text
No partial database state.

Later retry can process again.
```

---

# 9. Transaction Commits but HTTP Response Is Lost

Solution:

```text
Provider retries webhook.

Idempotency prevents duplicate processing.
```

---

# 10. Reservation Expires While Payment Is Being Processed

Solution:

```text
Conditional state transitions
+
Recovery logic
```

---

# 11. Payment Arrives After Reservation Expiry

Solution:

```text
Try atomic inventory reacquisition.

If successful:
    fulfill

Otherwise:
    REFUND_REQUIRED
```

---

# 12. Multiple Expiry Workers Process Same Reservation

Solution:

```text
Only expire if status is still RESERVED.
```

Later attempts:

```text
Already EXPIRED
→ Do nothing.
```

---

# 13. Delayed Payment and New Booking Compete

Solution:

```text
Atomic conditional inventory update.
```

Both compete for the same available inventory.

---

# INTERVIEW QUESTIONS — ARCHITECTURE LEVEL

# Q1. Explain your complete booking and payment flow.

### Strong Answer

When a user initiates a booking, the backend first handles idempotency so retries of the same logical request do not create duplicate orders. The system then atomically reserves inventory using a conditional database update so concurrent users cannot oversell limited tickets.

Inside a transaction, the system creates the reservation and order so the booking operation does not leave partial state.

The backend then creates a payment order with the external payment provider. The actual payment happens outside our database transaction because the provider is an independent external system.

After payment, the provider sends a webhook to the backend. We verify the webhook because the frontend is not an authoritative source of payment success.

The payment finalization transaction updates the payment, order, reservation, and inventory and creates tickets atomically.

Reservations that are abandoned expire through a background worker and release inventory.

Finally, if a payment confirmation arrives after reservation expiry, the system attempts to atomically reacquire inventory. If inventory is unavailable, the order enters a `refund_required` state rather than overselling.

---

# Q2. How do you prevent overselling?

### Strong Answer

I use a database-level atomic conditional update.

Instead of reading inventory in the application and later updating it, the database operation checks whether enough inventory exists and reserves it in the same operation.

This removes the application-level race window where multiple users could read the same available quantity.

---

# Q3. Why is an application-level availability check unsafe?

### Strong Answer

Because checking availability and updating inventory are separate operations.

Two concurrent requests can both read the same availability and both decide booking is possible.

The condition must therefore be enforced at the database operation itself.

---

# Q4. What is the difference between atomic update and transaction?

### Strong Answer

An atomic conditional update protects a single shared resource or state modification, such as reserving inventory only when enough tickets exist.

A transaction protects consistency across multiple related database operations.

For example, payment finalization updates Payment, Order, Reservation, Inventory, and Ticket records together.

---

# Q5. What is the difference between transaction and idempotency?

### Strong Answer

A transaction ensures related operations succeed or fail together.

Idempotency ensures repeated attempts of the same logical operation do not create multiple effects.

For example:

```text
Transaction:
Payment + Order + Inventory are consistent.

Idempotency:
Duplicate webhook does not process payment twice.
```

---

# Q6. Why do you need a unique constraint if you already have transactions?

### Strong Answer

Transactions provide all-or-nothing behavior, but they do not by themselves express every uniqueness rule.

A unique constraint enforces that duplicate values cannot be stored.

For example:

```text
Same providerPaymentId
```

should not create multiple Payment records.

---

# Q7. Why not trust the frontend after payment?

### Strong Answer

The frontend is client-controlled and can be manipulated.

A frontend success response does not prove money was actually received.

The payment provider is the authoritative source, so the backend processes verified provider confirmation.

---

# Q8. Why are webhooks idempotent?

### Strong Answer

Webhook delivery may be retried because of timeouts, crashes, or lost responses.

Therefore the same payment event may arrive multiple times.

Processing must produce only one final business effect.

---

# Q9. What happens if your server crashes during payment processing?

### Strong Answer

If the database transaction has not committed, it rolls back and leaves no partial state.

A later webhook retry can process the payment again.

If the transaction committed but the response was lost, a duplicate webhook detects the already finalized state and safely does nothing.

---

# Q10. Why don't you call the payment provider inside the database transaction?

### Strong Answer

The payment provider is an external independent system and cannot participate in our MongoDB transaction.

The external call may also have unpredictable network latency and failures.

A database transaction should not remain open while waiting on an external network operation.

---

# Q11. What happens when a reservation expires?

### Strong Answer

A background worker finds reservations that are still `RESERVED` and whose expiration time has passed.

It atomically performs the expiration business operation inside a transaction:

```text
Reservation → EXPIRED

Release reserved inventory
```

If processing is retried, an already expired reservation is ignored.

---

# Q12. What if expiry and payment happen simultaneously?

### Strong Answer

Both operations compete to transition the same reservation.

The state transition should be conditional on the expected current state.

Conceptually:

```text
Expire only if still RESERVED.

Confirm only if still RESERVED.
```

If payment confirmation arrives after expiry, delayed-payment recovery handles the situation.

---

# Q13. What happens if money is received after the reservation expired?

### Strong Answer

The system cannot blindly create tickets because the released inventory may already have been taken by another user.

It atomically checks and tries to acquire current inventory.

If successful, the system fulfills the order.

If not, it records `refund_required` and does not create tickets.

---

# Q14. Why not create tickets if payment succeeded?

### Strong Answer

Payment success proves money was received.

It does not prove inventory still exists.

Creating tickets without available inventory could oversell the event.

---

# Q15. Why REFUND_REQUIRED instead of FAILED?

### Strong Answer

`FAILED` may imply payment was unsuccessful.

`REFUND_REQUIRED` explicitly represents:

```text
Money received
+
Cannot fulfill order
+
Refund action required
```

The state accurately represents reality and indicates the next required action.

---

# EDGE CASE INTERVIEW QUESTIONS

# Edge Case 1

## Question

Two users send booking requests at exactly the same time. Both see that two tickets are available.

What prevents overselling?

### Answer

The application should not rely on the earlier read.

The database performs a conditional atomic update:

```text
Reserve tickets only if enough inventory still exists.
```

The check and modification happen together.

---

# Edge Case 2

## Question

The same user sends two identical booking requests because of a timeout.

What happens?

### Answer

Both requests use the same idempotency key.

The database uniqueness rule prevents multiple orders for the same logical operation.

The duplicate request returns the existing result rather than creating another booking.

---

# Edge Case 3

## Question

Inventory reservation succeeds, but Order creation fails.

What happens?

### Answer

The booking transaction rolls back.

The inventory reservation should not remain committed independently.

---

# Edge Case 4

## Question

The user pays, but closes the browser before returning to your application.

How do you know payment succeeded?

### Answer

The frontend redirect is not authoritative.

The payment provider independently sends a verified webhook to the backend.

---

# Edge Case 5

## Question

The same webhook arrives five times.

What happens?

### Answer

Webhook processing is idempotent.

Only the first valid processing creates the business effect.

Later deliveries detect the already processed state and safely acknowledge.

---

# Edge Case 6

## Question

The transaction commits, but your server crashes before returning HTTP 200 to the provider.

What happens?

### Answer

The provider may retry the webhook.

The retry does not duplicate processing because the payment has already been finalized.

The backend safely recognizes the existing state.

---

# Edge Case 7

## Question

The server crashes halfway through payment finalization.

What happens?

### Answer

If the transaction has not committed, the database rolls back the transaction.

No partial finalization state remains.

A later retry can safely process the payment.

---

# Edge Case 8

## Question

A reservation expires exactly when payment confirmation arrives.

What happens?

### Answer

Both operations compete for the reservation state.

The state transition should be conditional on the expected current state.

If expiry wins and payment later needs fulfillment, delayed-payment recovery handles inventory reacquisition.

---

# Edge Case 9

## Question

The reservation expired and released inventory. A delayed payment arrives, but another user has already bought the tickets.

What happens?

### Answer

The system must not create tickets because that would oversell.

It records:

```text
REFUND_REQUIRED
```

and initiates or schedules a compensating refund process.

---

# Edge Case 10

## Question

The delayed payment recovery and a new booking both attempt to consume the last tickets.

What prevents both from succeeding?

### Answer

Both operations use atomic conditional inventory updates.

They compete for the same shared inventory.

The database condition determines whether each operation can still successfully consume inventory.

---

# FINAL INTERVIEW CHEAT SHEET

# The 8 Most Important Statements

## 1.

> Atomic conditional updates protect limited shared inventory from race conditions.

## 2.

> Transactions protect consistency when multiple related database changes must succeed or fail together.

## 3.

> Unique constraints enforce uniqueness and provide database-level protection against duplicates.

## 4.

> Idempotency makes repeated attempts of the same logical operation safe.

## 5.

> The frontend is not authoritative for payment success; verified provider confirmation is.

## 6.

> External payment providers should not be included inside database transactions because they are independent distributed systems.

## 7.

> Background expiry workers release temporary resource holds when users abandon an operation.

## 8.

> Payment success and fulfillment success are separate facts; when fulfillment becomes impossible after money is received, the system needs recovery and compensation.

---

# THE MOST IMPORTANT MENTAL MODEL

```text
                    CONCURRENCY
                         │
                         ▼
              Atomic Conditional Update
                         │
                         │
                         ▼
                  Shared Inventory


                    CONSISTENCY
                         │
                         ▼
                    Transaction
                         │
                         ▼
              Multiple DB Operations


                    DUPLICATES
                         │
                         ▼
                 Unique Constraint
                         │
                         +
                    Idempotency


              EXTERNAL PAYMENT
                         │
                         ▼
                 Payment Provider
                         │
                         ▼
                Verified Webhook


                  TIMEOUTS
                         │
                         ▼
                Reservation Expiry
                         │
                         ▼
                Release Inventory


               DISTRIBUTED FAILURE
                         │
                         ▼
             Delayed Payment Recovery
                         │
                         ▼
             Fulfill OR Compensate
```

---

# FINAL SUMMARY

The Evently architecture solves several different categories of problems.

```text
Limited inventory
→ Atomic conditional updates


Multiple related DB changes
→ Transactions


Duplicate requests
→ Idempotency


Duplicate records
→ Unique constraints


External payment truth
→ Verified webhooks


Abandoned bookings
→ Expiry worker


Payment after expiry
→ Recovery + compensation
```

The biggest lesson is:

> Different mechanisms solve different problems.

Do not use one concept for everything.

```text
Atomic Update ≠ Transaction

Transaction ≠ Idempotency

Idempotency ≠ Unique Constraint

Payment Success ≠ Fulfillment Success
```

Understanding these distinctions is the foundation of explaining this architecture clearly in an interview.
