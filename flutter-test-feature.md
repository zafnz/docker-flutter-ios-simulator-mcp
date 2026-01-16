# Flutter Test functionality

These are the specs for implementing the full flutter test functionality:

## tools
### flutter_test
Begin a flutter test run with optional filtering:
   testTarget="test/unit/" # Specific test file or directory (relative path, no ".." allowed)
   testNameMatch="test_match*" # Regex to match test names
   timeout=10 # Timeout in minutes (default: 10)
   tags=["unit"] # Only run tests with specified tags

Returns a reference that can be passed to get the results of the test:
```json
{
    reference: 1234
}
```

### flutter_test_results
Obtain the results of the test, or the progress through the testing, takes the reference and an optional showAllTestNames, returns

```json
{
    reference: 1234,
    tests_complete: 500,
    tests_total: 1000,
    passes: 450,
    fails: 50,
    complete: false,
}
```
if showAllTestNames is set to true, then the result also includes two arrays, passingTests and failingTests

## flutter_test_logs
Returns an array of test result logs, by default it only shows failures, takes an optional showAll=false, which if true returns all results, not just failures.
```json
[
    {
        test_name: "failing test",
        output: "the multiline log of the failure for this test"
    },
    {
        test_name: "failing test 2"
        ...
    }
]
```
# Functionality
The app should save all the results of the flutter test while the session is active. 
