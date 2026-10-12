import Foundation
import Vision

struct Interpretation: Encodable {
    let kind = "classified"
    let source = "Apple Vision"
    let modelVersion: String
    let label: String
    let confidence: Float
}

// Only clothing labels leave Vision; person attributes are never returned.
let clothing: Set<String> = ["clothing", "shirt", "t-shirt", "t_shirt", "blouse", "sweater", "jacket", "coat", "dress", "skirt", "pants", "jeans", "trousers", "shorts", "shoe", "shoes", "footwear", "sneaker", "sneakers", "boot", "boots", "sandal", "sandals"]
do {
    let request = VNClassifyImageRequest()
    request.revision = VNClassifyImageRequestRevision2
    try VNImageRequestHandler(url: URL(fileURLWithPath: CommandLine.arguments[1])).perform([request])
    if let result = request.results?.filter({ clothing.contains($0.identifier.lowercased()) }).max(by: { $0.confidence < $1.confidence }) {
        let data = try JSONEncoder().encode(Interpretation(modelVersion: "VNClassifyImageRequest revision \(request.revision)", label: result.identifier, confidence: result.confidence))
        FileHandle.standardOutput.write(data)
    } else {
        print("{\"kind\":\"unavailable\",\"reason\":\"no-clothing-label\"}")
    }
} catch {
    print("{\"kind\":\"unavailable\",\"reason\":\"classification-failed\"}")
}
