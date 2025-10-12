<?php
// --- Load secret key ---
$config = include(__DIR__ . '/../../config/secrets.php');
$MAPTILER_KEY = $config['MAPTILER_KEY'];

// --- Input validation ---
$style = preg_replace('/[^a-zA-Z0-9\-_]/', '', $_GET['style'] ?? 'streets-v2');
$z = intval($_GET['z'] ?? 0);
$x = intval($_GET['x'] ?? 0);
$y = intval($_GET['y'] ?? 0);

// --- Cache directory setup ---
$cacheDir = __DIR__ . "/cache/$style";
if (!is_dir($cacheDir)) mkdir($cacheDir, 0777, true);
$cacheFile = "$cacheDir/{$z}_{$x}_{$y}.png";

// --- Serve from cache if exists ---
if (file_exists($cacheFile)) {
    header('Content-Type: image/png');
    readfile($cacheFile);
    exit;
}

// --- Fetch from MapTiler ---
$url = "https://api.maptiler.com/maps/$style/$z/$x/$y@2x.png?key=$MAPTILER_KEY";

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_HEADER => false,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_TIMEOUT => 10
]);
$data = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// --- Output or error ---
if ($httpCode == 200 && $data) {
    // Save to cache
    file_put_contents($cacheFile, $data);
    header('Content-Type: image/png');
    echo $data;
} else {
    http_response_code($httpCode);
    echo "Tile unavailable (code: $httpCode)";
}

foreach (glob("$cacheDir/*.png") as $file) {
    if (filemtime($file) < time() - 60 * 60) {
        unlink($file);
    }
}