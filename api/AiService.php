<?php
declare(strict_types=1);

namespace RecruitPro;

use ZipArchive;
use Exception;

class AiService {
    public const TAXONOMY_SKILLS = [
        // Lenguajes de Programación
        "python" => "Python",
        "javascript" => "JavaScript",
        "typescript" => "TypeScript",
        "java" => "Java",
        "c#" => "C#",
        "c++" => "C++",
        "golang" => "Go / Golang",
        "go" => "Go",
        "php" => "PHP",
        "ruby" => "Ruby",
        "rust" => "Rust",
        "kotlin" => "Kotlin",
        "swift" => "Swift",
        "r" => "R",
        "sql" => "SQL",
        "html" => "HTML",
        "css" => "CSS",
        "sass" => "Sass/SCSS",
        "bash" => "Bash / Shell",
        "powershell" => "PowerShell",

        // Frameworks Web y Móvil
        "fastapi" => "FastAPI",
        "django" => "Django",
        "flask" => "Flask",
        "react" => "React",
        "react native" => "React Native",
        "next.js" => "Next.js",
        "nextjs" => "Next.js",
        "vue" => "Vue.js",
        "vue.js" => "Vue.js",
        "angular" => "Angular",
        "svelte" => "Svelte",
        "nodejs" => "Node.js",
        "node.js" => "Node.js",
        "node" => "Node.js",
        "express" => "Express.js",
        "nestjs" => "NestJS",
        "spring" => "Spring Boot",
        "spring boot" => "Spring Boot",
        ".net" => ".NET",
        "asp.net" => "ASP.NET",
        "laravel" => "Laravel",
        "tailwind" => "Tailwind CSS",
        "bootstrap" => "Bootstrap",
        "flutter" => "Flutter",

        // Bases de Datos y Almacenamiento
        "postgresql" => "PostgreSQL",
        "postgres" => "PostgreSQL",
        "mysql" => "MySQL",
        "sqlite" => "SQLite",
        "mongodb" => "MongoDB",
        "redis" => "Redis",
        "oracle" => "Oracle DB",
        "sql server" => "SQL Server",
        "mariadb" => "MariaDB",
        "elasticsearch" => "Elasticsearch",
        "cassandra" => "Cassandra",
        "dynamodb" => "DynamoDB",
        "sqlalchemy" => "SQLAlchemy",

        // DevOps, Cloud e Infraestructura
        "docker" => "Docker",
        "kubernetes" => "Kubernetes",
        "k8s" => "Kubernetes",
        "aws" => "AWS Cloud",
        "azure" => "Microsoft Azure",
        "gcp" => "Google Cloud (GCP)",
        "git" => "Git",
        "github" => "GitHub",
        "gitlab" => "GitLab",
        "ci/cd" => "CI/CD Pipelines",
        "linux" => "Linux",
        "ubuntu" => "Ubuntu",
        "terraform" => "Terraform",
        "ansible" => "Ansible",
        "nginx" => "Nginx",
        "microservicios" => "Arquitectura de Microservicios",
        "microservices" => "Microservicios",
        "api rest" => "APIs RESTful",
        "rest" => "REST APIs",
        "restful" => "RESTful",
        "graphql" => "GraphQL",
        "kafka" => "Apache Kafka",
        "rabbitmq" => "RabbitMQ",

        // Ciencia de Datos, IA y Analítica
        "machine learning" => "Machine Learning",
        "deep learning" => "Deep Learning",
        "ciencia de datos" => "Ciencia de Datos",
        "data science" => "Data Science",
        "inteligencia artificial" => "Inteligencia Artificial",
        "ia" => "Inteligencia Artificial",
        "nlp" => "Procesamiento de Lenguaje Natural (NLP)",
        "pytorch" => "PyTorch",
        "tensorflow" => "TensorFlow",
        "scikit-learn" => "Scikit-Learn",
        "pandas" => "Pandas",
        "numpy" => "NumPy",
        "power bi" => "Power BI",
        "powerbi" => "Power BI",
        "tableau" => "Tableau",
        "excel" => "Excel Avanzado",
        "big data" => "Big Data",
        "spark" => "Apache Spark",
        "etl" => "Procesos ETL",

        // Diseño, UI/UX y Creatividad
        "ui/ux" => "Diseño UI/UX",
        "ux" => "Experiencia de Usuario (UX)",
        "ui" => "Interfaz de Usuario (UI)",
        "figma" => "Figma",
        "adobe xd" => "Adobe XD",
        "sketch" => "Sketch",
        "photoshop" => "Adobe Photoshop",
        "illustrator" => "Adobe Illustrator",
        "wireframes" => "Wireframing",
        "prototipado" => "Prototipado",
        "design system" => "Sistemas de Diseño",
        "diseno grafico" => "Diseño Gráfico",
        "diseño gráfico" => "Diseño Gráfico",

        // Gestión de Proyectos, Producto y Metodologías
        "scrum" => "Metodología Scrum",
        "agile" => "Metodologías Ágiles",
        "kanban" => "Kanban",
        "jira" => "Jira Software",
        "confluence" => "Confluence",
        "trello" => "Trello",
        "gestion de proyectos" => "Gestión de Proyectos",
        "gestión de proyectos" => "Gestión de Proyectos",
        "project management" => "Project Management",
        "product management" => "Product Management",
        "scrum master" => "Scrum Master",
        "product owner" => "Product Owner",
        "roadmap" => "Planificación de Roadmaps",
        "kpis" => "Indicadores Clave (KPIs)",
        "okrs" => "Gestión por OKRs",

        // Calidad y Pruebas (QA)
        "qa" => "Control de Calidad (QA)",
        "testing" => "Pruebas de Software",
        "pruebas unitarias" => "Pruebas Unitarias",
        "cypress" => "Cypress",
        "selenium" => "Selenium",
        "jest" => "Jest",
        "pytest" => "PyTest",
        "postman" => "Postman",
        "automatizacion" => "Automatización de Pruebas",
        "automatización" => "Automatización de Pruebas",

        // Negocios, Ventas y Operaciones
        "ventas" => "Ventas y Negociación",
        "sales" => "Ventas B2B / B2C",
        "b2b" => "Modelos B2B",
        "b2c" => "Modelos B2C",
        "crm" => "Gestión CRM",
        "marketing digital" => "Marketing Digital",
        "seo" => "Optimización SEO",
        "sem" => "Campañas SEM",
        "servicio al cliente" => "Servicio al Cliente",
        "atencion al cliente" => "Atención al Cliente",
        "atención al cliente" => "Atención al Cliente",
        "finanzas" => "Finanzas Corporativas",
        "contabilidad" => "Contabilidad",
        "recursos humanos" => "Recursos Humanos (RRHH)",
        "talento humano" => "Gestión de Talento Humano",
        "reclutamiento" => "Reclutamiento y Selección",

        // Habilidades Blandas Nucleares
        "liderazgo" => "Liderazgo de Equipos",
        "trabajo en equipo" => "Trabajo en Equipo",
        "comunicacion asertiva" => "Comunicación Asertiva",
        "comunicacion" => "Comunicación Efectiva",
        "resolucion de problemas" => "Resolución de Problemas",
        "pensamiento critico" => "Pensamiento Crítico",
        "adaptabilidad" => "Adaptabilidad y Aprendizaje Ágil",
        "proactividad" => "Proactividad e Iniciativa",
        "negociacion" => "Habilidades de Negociación",
    ];

    public static function normalizeText(string $text): string {
        if (empty($text)) {
            return "";
        }
        $text = mb_strtolower($text, 'UTF-8');
        // Replace diacritics
        $replacements = [
            'á'=>'a', 'é'=>'e', 'í'=>'i', 'ó'=>'o', 'ú'=>'u', 'ü'=>'u', 'ñ'=>'n',
            'à'=>'a', 'è'=>'e', 'ì'=>'i', 'ò'=>'o', 'ù'=>'u',
            'ä'=>'a', 'ë'=>'e', 'ï'=>'i', 'ö'=>'o',
            'â'=>'a', 'ê'=>'e', 'î'=>'i', 'ô'=>'o', 'û'=>'u'
        ];
        return strtr($text, $replacements);
    }

    public static function skillInText(string $skill, string $normalizedText): bool {
        $normSkill = trim(self::normalizeText($skill));
        if (empty($normSkill)) {
            return false;
        }

        if (strlen($normSkill) === 1) {
            $escaped = preg_quote($normSkill, '/');
            $pattern = "/(?<![a-z0-9])(?:lenguaje\s+{$escaped}|c\s*\/\s*c\+\+)(?![a-z0-9])/i";
            return (bool)preg_match($pattern, $normalizedText);
        }

        $escaped = preg_quote($normSkill, '/');
        $pattern = "/(?<![a-z0-9]){$escaped}(?![a-z0-9#+])/i";
        return (bool)preg_match($pattern, $normalizedText);
    }

    public static function extractTextFromFile(string $filePath, string $originalFilename = ''): string {
        if (!is_file($filePath)) {
            return "";
        }
        $data = @file_get_contents($filePath);
        if ($data === false || strlen($data) === 0) {
            return "";
        }

        $header = substr($data, 0, 2048);
        $origLower = strtolower($originalFilename);

        // 1. PDF
        $isPdf = str_starts_with($header, "%PDF-") || (strpos($header, "%PDF-") !== false) || str_ends_with($origLower, '.pdf');
        if ($isPdf) {
            // PDF text parser from streams
            $text = "";
            // Find text inside parentheses before Tj, TJ, ', "
            if (preg_match_all('/\(([^)]+)\)\s*(?:Tj|\'|")/i', $data, $matches)) {
                $text = implode(" ", $matches[1]);
            }
            // Also inspect uncompressed stream chunks
            if (preg_match_all('/stream[\r\n]+(.*?)[\r\n]+endstream/is', $data, $streamMatches)) {
                foreach ($streamMatches[1] as $chunk) {
                    // Test if chunk is printable text
                    $printable = preg_replace('/[^\x20-\x7E\r\n\t]/', '', $chunk);
                    if (strlen($printable) > 30 && (strlen($printable) / max(1, strlen($chunk))) > 0.6) {
                        $text .= " " . $printable;
                    }
                }
            }
            $cleanPdf = trim(preg_replace('/\s+/', ' ', $text));
            if (strlen($cleanPdf) >= 20) {
                return $cleanPdf;
            }
        }

        // 2. DOCX (ZIP format)
        $isZip = str_starts_with($header, "PK\x03\x04") || str_ends_with($origLower, '.docx') || str_ends_with($origLower, '.odt');
        if ($isZip && class_exists('ZipArchive')) {
            $zip = new ZipArchive();
            if ($zip->open($filePath) === true) {
                $xml = $zip->getFromName('word/document.xml');
                $zip->close();
                if ($xml !== false) {
                    if (preg_match_all('/<w:t[^>]*>(.*?)<\/w:t>/is', $xml, $tMatches)) {
                        return trim(implode(" ", $tMatches[1]));
                    }
                    $stripped = strip_tags($xml);
                    return trim(preg_replace('/\s+/', ' ', $stripped));
                }
            }
        }

        // 3. Fallback to UTF-8 / Latin-1 plain text
        $printable = preg_replace('/[^\x20-\x7E\r\n\t\xA0-\xFF]/', '', $data);
        if (strlen($printable) > 20 && (strlen($printable) / strlen($data)) > 0.65) {
            return trim($printable);
        }

        return "";
    }

    public static function extractYearsOfExperience(string $text): int {
        $norm = self::normalizeText($text);
        $years = [];

        // Pattern 1: 'X años de experiencia'
        if (preg_match_all('/\b(\d{1,2})\+?\s*(?:anos|anios|years|ano|anio|yr|yrs)\b(?:\s*(?:de\s+)?(?:experiencia|trayectoria|laboral))?/i', $norm, $m)) {
            foreach ($m[1] as $val) {
                $v = (int)$val;
                if ($v >= 1 && $v <= 40) $years[] = $v;
            }
        }

        // Pattern 2: 'mas de X anos'
        if (preg_match_all('/(?:mas de|over)\s*(\d{1,2})\s*(?:anos|anios|years)/i', $norm, $m2)) {
            foreach ($m2[1] as $val) {
                $v = (int)$val;
                if ($v >= 1 && $v <= 40) $years[] = $v;
            }
        }

        // Pattern 3: Year ranges
        $currentYear = (int)date('Y');
        if (preg_match_all('/\b(19\d\d|20\d\d)\s*(?:a|al|-|–|to|hasta)\s*(19\d\d|20\d\d|presente|actualidad|present)\b/i', $norm, $m3, PREG_SET_ORDER)) {
            $rangeTotal = 0;
            foreach ($m3 as $match) {
                $start = (int)$match[1];
                $endStr = $match[2];
                $end = is_numeric($endStr) ? (int)$endStr : $currentYear;
                $diff = $end - $start;
                if ($diff >= 0 && $diff <= 30 && $start <= $end) {
                    $rangeTotal += $diff;
                }
            }
            if ($rangeTotal > 0) {
                $years[] = min(35, $rangeTotal);
            }
        }

        return !empty($years) ? max($years) : 0;
    }

    public static function detectSeniority(string $text): array {
        $norm = self::normalizeText($text);
        $years = self::extractYearsOfExperience($text);

        $isLead = (bool)preg_match('/\b(arquitecto|architect|lead|tech lead|lider tecnico|principal|staff|director|gerente)\b/i', $norm);
        $isSenior = (bool)preg_match('/\b(senior|sr|especialista|avanzado)\b/i', $norm);
        $isMid = (bool)preg_match('/\b(semi[- ]?senior|ssr|mid|intermedio)\b/i', $norm);
        $isJunior = (bool)preg_match('/\b(junior|jr|trainee|practicante|entry|sin experiencia|recien graduado)\b/i', $norm);

        if ($isLead || $years >= 8) {
            return ['label' => "Lead / Arquitecto", 'years' => max($years, 8)];
        }
        if ($isSenior || $years >= 5) {
            return ['label' => "Senior", 'years' => max($years, 5)];
        }
        if ($isMid || $years >= 2) {
            return ['label' => "Semi-Senior", 'years' => max($years, 2)];
        }
        if ($isJunior) {
            return ['label' => "Junior / Inicial", 'years' => $years];
        }
        if ($years >= 4) {
            return ['label' => "Semi-Senior Avanzado", 'years' => $years];
        }
        if ($years >= 1) {
            return ['label' => "Junior / Formación", 'years' => $years];
        }

        return ['label' => "Junior / Nivel Inicial", 'years' => 0];
    }

    public static function extractVacancyRequirements(string $vacancyTitle, string $vacancyDescription): array {
        $combined = "$vacancyTitle $vacancyDescription";
        $norm = self::normalizeText($combined);

        $detected = [];
        foreach (self::TAXONOMY_SKILLS as $key => $display) {
            if (self::skillInText($key, $norm)) {
                if (!in_array($display, $detected, true)) {
                    $detected[] = $display;
                }
            }
        }

        // Acronyms (e.g. AWS, CRM, ERP, KPI)
        if (preg_match_all('/\b[A-Z]{2,6}\b/', $combined, $matches)) {
            $ignored = ["EL", "LA", "LOS", "LAS", "POR", "CON", "DEL", "QUE", "UNA", "MAS", "PARA", "SIN", "SUS", "SUR", "NOR"];
            $uniqueAcronyms = array_unique($matches[0]);
            foreach ($uniqueAcronyms as $acr) {
                if (!in_array($acr, $ignored, true)) {
                    $lowerAcr = strtolower($acr);
                    $alreadyCovered = false;
                    foreach ($detected as $d) {
                        if (str_contains(strtolower($d), $lowerAcr)) {
                            $alreadyCovered = true;
                            break;
                        }
                    }
                    if (!$alreadyCovered) {
                        $detected[] = $acr;
                    }
                }
            }
        }

        if (empty($detected)) {
            $detected = ["Resolución de problemas", "Trabajo en equipo", "Comunicación efectiva", "Alineación al puesto"];
        }

        return $detected;
    }

    public static function analyzeCompatibility(
        string $candidateName,
        string $candidateEmail,
        string $candidateLocation,
        string $vacancyTitle,
        string $vacancyDescription,
        string $vacancyType,
        string $resumeText = ""
    ): array {
        $cleanResume = trim($resumeText);
        $normResume = self::normalizeText($cleanResume);
        $normCandidateMeta = self::normalizeText("$candidateName $candidateLocation $candidateEmail");
        $fullCandidateCorpus = "$normCandidateMeta $normResume";

        $normVacTitle = self::normalizeText($vacancyTitle);
        $normVacDesc = self::normalizeText($vacancyDescription);
        $normVacType = self::normalizeText($vacancyType);
        $fullVacancyCorpus = "$normVacTitle $normVacDesc $normVacType";

        $isCvEmpty = strlen($cleanResume) < 30;

        // 1. REQUISITOS TÉCNICOS (40%)
        $requiredSkills = self::extractVacancyRequirements($vacancyTitle, $vacancyDescription);
        $matchedSkills = [];
        $missingSkills = [];

        if (!$isCvEmpty) {
            foreach ($requiredSkills as $skill) {
                if (self::skillInText($skill, $fullCandidateCorpus)) {
                    $matchedSkills[] = $skill;
                } else {
                    $missingSkills[] = $skill;
                }
            }
        } else {
            $missingSkills = $requiredSkills;
        }

        $additionalSkills = [];
        if (!$isCvEmpty) {
            foreach (self::TAXONOMY_SKILLS as $key => $display) {
                if (!in_array($display, $matchedSkills, true) && !in_array($display, $missingSkills, true)) {
                    if (self::skillInText($key, $normResume)) {
                        if (!in_array($display, $additionalSkills, true)) {
                            $additionalSkills[] = $display;
                        }
                    }
                }
            }
        }

        $skillsMatchRatio = !empty($requiredSkills) ? (count($matchedSkills) / count($requiredSkills)) : 0.5;
        $skillsScore = $skillsMatchRatio * 100.0;

        // 2. AFINIDAD DE CARGO Y ROL (25%)
        $stopwords = ["de", "en", "para", "y", "e", "o", "u", "un", "una", "el", "la", "los", "las", "del", "al", "con", "por", "a"];
        preg_match_all('/\b[a-z0-9+#.-]{3,}\b/', $normVacTitle, $tokenMatches);
        $titleTokens = array_values(array_filter($tokenMatches[0], fn($w) => !in_array($w, $stopwords, true)));

        $roleMatches = 0.0;
        if (!empty($titleTokens) && !$isCvEmpty) {
            $headerText = substr($normResume, 0, 600);
            foreach ($titleTokens as $tok) {
                if (str_contains($headerText, $tok)) {
                    $roleMatches += 1.5;
                } elseif (str_contains($normResume, $tok)) {
                    $roleMatches += 1.0;
                }
            }
            $roleMatchRatio = min(1.0, $roleMatches / count($titleTokens));
        } else {
            $roleMatchRatio = !$isCvEmpty ? 0.3 : 0.0;
        }
        $roleScore = $roleMatchRatio * 100.0;

        // 3. EXPERIENCIA Y SENIORITY (15%)
        $candSeniorityInfo = self::detectSeniority($cleanResume);
        $candSeniority = $candSeniorityInfo['label'];
        $candYears = $candSeniorityInfo['years'];

        $vacSeniorityInfo = self::detectSeniority("$vacancyTitle $vacancyDescription");
        $vacSeniority = $vacSeniorityInfo['label'];

        if ($isCvEmpty) {
            $seniorityScore = 15.0;
        } elseif ($vacSeniority === "Lead / Arquitecto") {
            if ($candSeniority === "Lead / Arquitecto") $seniorityScore = 100.0;
            elseif ($candSeniority === "Senior") $seniorityScore = 75.0;
            elseif (str_starts_with($candSeniority, "Semi-Senior")) $seniorityScore = 45.0;
            else $seniorityScore = 25.0;
        } elseif ($vacSeniority === "Senior") {
            if (in_array($candSeniority, ["Senior", "Lead / Arquitecto"], true)) $seniorityScore = 100.0;
            elseif (str_starts_with($candSeniority, "Semi-Senior")) $seniorityScore = 70.0;
            else $seniorityScore = 30.0;
        } elseif (str_starts_with($vacSeniority, "Semi-Senior")) {
            if (in_array($candSeniority, ["Semi-Senior", "Semi-Senior Avanzado", "Senior", "Lead / Arquitecto"], true)) $seniorityScore = 100.0;
            else $seniorityScore = 55.0;
        } elseif ($vacSeniority === "Junior / Inicial") {
            $seniorityScore = 100.0;
        } else {
            if ($candYears >= 4) $seniorityScore = 100.0;
            elseif ($candYears >= 2) $seniorityScore = 80.0;
            elseif ($candYears >= 1) $seniorityScore = 65.0;
            else $seniorityScore = 50.0;
        }

        // 4. FORMACIÓN ACADÉMICA (10%)
        $degreeKeywords = ["ingenier", "licenciad", "profesional", "tecnolog", "tecnic", "master", "magister", "especializ", "diplomad", "universitari", "grado", "doctor", "phd", "certificad", "certificacion", "certified"];
        $hasDegree = false;
        $hasCerts = false;
        if (!$isCvEmpty) {
            foreach ($degreeKeywords as $dk) {
                if (str_contains($normResume, $dk)) {
                    $hasDegree = true;
                    break;
                }
            }
            foreach (["certificacion", "certificado", "certified", "scrum master", "aws certified"] as $ck) {
                if (str_contains($normResume, $ck)) {
                    $hasCerts = true;
                    break;
                }
            }
        }

        if ($hasDegree && $hasCerts) $educationScore = 100.0;
        elseif ($hasDegree || $hasCerts) $educationScore = 85.0;
        elseif (!$isCvEmpty) $educationScore = 50.0;
        else $educationScore = 15.0;

        // 5. UBICACIÓN Y MODALIDAD (10%)
        $isRemote = str_contains($fullVacancyCorpus, "remoto") || str_contains($fullVacancyCorpus, "remote") || str_contains($fullVacancyCorpus, "teletrabajo") || str_contains($fullVacancyCorpus, "home office") || str_contains($normVacType, "remot");
        $normLoc = self::normalizeText($candidateLocation);

        if ($isRemote) {
            $locationScore = 100.0;
            $locationStatus = "Modalidad remota compatible";
        } elseif (!empty($normLoc) && str_contains($fullVacancyCorpus, $normLoc)) {
            $locationScore = 100.0;
            $locationStatus = "Ubicación coincidente ($candidateLocation)";
        } elseif (empty($candidateLocation)) {
            $locationScore = 65.0;
            $locationStatus = "Ubicación pendiente de confirmar";
        } else {
            $locationScore = 40.0;
            $locationStatus = "Ubicación declarada: $candidateLocation";
        }

        // CÁLCULO PONDERADO FINAL
        $rawComposite = (
            ($skillsScore * 0.40) +
            ($roleScore * 0.25) +
            ($seniorityScore * 0.15) +
            ($educationScore * 0.10) +
            ($locationScore * 0.10)
        );

        $bonus = min(5, count($additionalSkills));
        $finalScoreNum = $rawComposite + $bonus;

        if (count($matchedSkills) === 0) {
            $finalScoreNum = min($finalScoreNum * 0.55, 34.0);
        } elseif ($skillsMatchRatio < 0.25) {
            $finalScoreNum = min($finalScoreNum * 0.75, 48.0);
        }

        if ($isCvEmpty) {
            $matchScore = 15;
        } else {
            $matchScore = min(98, max(18, (int)round($finalScoreNum)));
        }

        // DICTAMEN Y ESTRELLAS
        if ($matchScore >= 85) {
            $stars = 5;
            $verdict = "Recomendación Favorable (Nivel Sobresaliente)";
            $suggestedStage = "entrevista";
            $pillColor = "#047857";
        } elseif ($matchScore >= 70) {
            $stars = 4;
            $verdict = "Perfil Altamente Competitivo (Apto para Entrevista)";
            $suggestedStage = "entrevista";
            $pillColor = "#1d4ed8";
        } elseif ($matchScore >= 50) {
            $stars = 3;
            $verdict = "Cumplimiento Parcial de Requisitos (Revisión Técnica)";
            $suggestedStage = "en_revision";
            $pillColor = "#b45309";
        } else {
            $stars = 2;
            $verdict = "Alineación Insuficiente con los Requisitos";
            $suggestedStage = "rechazada";
            $pillColor = "#b91c1c";
        }

        // RESUMEN EJECUTIVO
        $matchedSlice = array_slice($matchedSkills, 0, 4);
        $matchedStr = !empty($matchedSlice) ? implode(", ", $matchedSlice) : "competencias en proceso de homologación";
        $expDesc = $candYears > 0 ? "$candYears años de trayectoria ($candSeniority)" : $candSeniority;
        $suggestedPretty = ucfirst(str_replace('_', ' ', $suggestedStage));

        if ($isCvEmpty) {
            $summary = "El expediente de $candidateName para la vacante de $vacancyTitle no contiene texto curricular legible. Se obtuvo una calificación base del {$matchScore}%. Se requiere solicitar al candidato que adjunte su CV en formato PDF estándar.";
        } else {
            $summary = "$candidateName presenta un índice de compatibilidad técnica del {$matchScore}% para la posición de $vacancyTitle. Acredita $expDesc con sólida evidencia en $matchedStr. Estado sugerido para el flujo de selección: $suggestedPretty.";
        }

        // FORTALEZAS
        $strengths = [];
        if (!empty($matchedSkills)) {
            $strengths[] = "Acreditación técnica comprobable en herramientas clave: " . implode(", ", array_slice($matchedSkills, 0, 4)) . ".";
        }
        if ($roleMatchRatio >= 0.6) {
            $strengths[] = "Afinidad directa de rol con el perfil de $vacancyTitle.";
        }
        if ($candYears > 0) {
            $strengths[] = "Experiencia laboral cuantificable estimada en $candYears años ($candSeniority).";
        }
        if ($hasDegree || $hasCerts) {
            $strengths[] = "Formación académica profesional y/o certificaciones acreditadas en su expediente.";
        }
        if ($isRemote || $locationScore >= 90) {
            $strengths[] = "Compatibilidad óptima con el esquema de trabajo: $locationStatus.";
        }
        if (!empty($additionalSkills)) {
            $strengths[] = "Aporta valor agregado con competencias complementarias: " . implode(", ", array_slice($additionalSkills, 0, 3)) . ".";
        }
        if (empty($strengths)) {
            $strengths[] = "Interés registrado en la posición y datos de contacto verificados.";
        }

        // BRECHAS
        $gaps = [];
        if (!empty($missingSkills)) {
            $gaps[] = "Sin mención documental explícita en el CV sobre: " . implode(", ", array_slice($missingSkills, 0, 3)) . ".";
        }
        if ($roleMatchRatio < 0.4 && !$isCvEmpty) {
            $gaps[] = "El título y enfoque principal de su CV no coinciden plenamente con el cargo convocado.";
        }
        if ($seniorityScore < 60 && !$isCvEmpty) {
            $gaps[] = "Nivel de experiencia detectado ($candSeniority) inferior al perfil esperado para $vacSeniority.";
        }
        if (!$isRemote && $locationScore < 70) {
            $locSnippet = substr($vacancyDescription, 0, 40);
            $gaps[] = "Modalidad no remota: validar disponibilidad de traslado o asistencia en $locSnippet.";
        }
        if ($isCvEmpty) {
            $gaps[] = "Documento curricular ilegible o sin texto extraíble mediante OCR/parser.";
        }
        if (empty($gaps)) {
            $gaps[] = "Validar pretensión salarial y fecha estimada de incorporación.";
            $gaps[] = "Profundizar en casos de éxito y resolución de problemas bajo presión.";
        }

        // PREGUNTAS
        $primarySkill = !empty($matchedSkills) ? $matchedSkills[0] : "su principal herramienta de trabajo";
        $missingSkill = !empty($missingSkills) ? $missingSkills[0] : "arquitectura escalable y resiliencia técnica";

        if (in_array($candSeniority, ["Senior", "Lead / Arquitecto"], true)) {
            $q1 = "Describa una decisión de arquitectura crítica donde haya empleado $primarySkill para optimizar rendimiento o escalabilidad.";
            $q2 = "Dado que la vacante involucra $missingSkill, ¿cuál ha sido su curva de aprendizaje o experiencia resolviendo retos relacionados?";
            $q3 = "¿Cómo aborda el liderazgo técnico, mentoría de desarrolladores y garantía de calidad (pruebas, CI/CD) en su equipo?";
        } else {
            $q1 = "Detalle un proyecto práctico donde haya implementado $primarySkill y cuál fue el resultado funcional obtenido.";
            $q2 = "La posición requiere conocimientos en $missingSkill. ¿Cómo se prepararía para dominar esta competencia en sus primeros 30 días?";
            $q3 = "¿Qué metodología de trabajo ágil prefiere y cómo prioriza sus entregables ante plazos exigentes?";
        }
        $interviewQuestions = [$q1, $q2, $q3];

        // ORIENTACIÓN AL CANDIDATO
        if ($isCvEmpty) {
            $candidateAdvice = "Te recomendamos volver a cargar tu hoja de vida en formato PDF legible para que el sistema evalúe tus competencias.";
        } elseif ($matchScore >= 80) {
            $candidateAdvice = "Tu perfil cuenta con un sobresaliente {$matchScore}% de afinidad con la vacante de $vacancyTitle. En tu entrevista técnica, destaca tus proyectos con $primarySkill y tu experiencia en liderazgo y arquitectura.";
        } elseif ($matchScore >= 60) {
            $candidateAdvice = "Tu compatibilidad técnica es del {$matchScore}%. Presentas fortalezas comprobables en $primarySkill. Te recomendamos reforzar y ejemplificar tus conocimientos prácticos en $missingSkill durante las fases de evaluación.";
        } else {
            $candidateAdvice = "Tu compatibilidad actual con esta vacante es del {$matchScore}%. Para mejorar tu posicionamiento, enfócate en desarrollar proyectos demostrables en $missingSkill y alinear tu CV al puesto de $vacancyTitle.";
        }

        return [
            "matchScore" => $matchScore,
            "stars" => $stars,
            "verdict" => $verdict,
            "suggestedStage" => $suggestedStage,
            "pillColor" => $pillColor,
            "summary" => $summary,
            "matchedSkills" => $matchedSkills,
            "missingSkills" => $missingSkills,
            "additionalSkills" => array_slice($additionalSkills, 0, 5),
            "candidateLevel" => $candSeniority,
            "candidateYears" => $candYears,
            "strengths" => $strengths,
            "gaps" => $gaps,
            "interviewQuestions" => $interviewQuestions,
            "candidateAdvice" => $candidateAdvice,
        ];
    }
}
