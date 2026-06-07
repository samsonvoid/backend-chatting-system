-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: May 26, 2026 at 10:32 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `web`
--

-- --------------------------------------------------------

--
-- Table structure for table `attendance`
--

CREATE TABLE `attendance` (
  `id` int(11) NOT NULL,
  `student_id` int(11) NOT NULL,
  `attendance_date` date NOT NULL,
  `status` enum('Present','Absent','Late') DEFAULT 'Absent',
  `remarks` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `attendance`
--

INSERT INTO `attendance` (`id`, `student_id`, `attendance_date`, `status`, `remarks`, `created_at`) VALUES
(1, 3, '2026-05-24', 'Late', '', '2026-05-24 13:58:10'),
(2, 1, '2026-05-24', 'Present', '', '2026-05-24 13:58:10'),
(3, 2, '2026-05-24', 'Present', '', '2026-05-24 13:58:10'),
(4, 3, '2026-05-26', 'Late', '', '2026-05-26 11:30:44'),
(5, 1, '2026-05-26', 'Absent', '', '2026-05-26 11:30:44'),
(6, 2, '2026-05-26', 'Present', '', '2026-05-26 11:30:44'),
(7, 9, '2026-05-26', 'Present', '', '2026-05-26 18:23:02');

-- --------------------------------------------------------

--
-- Table structure for table `courses`
--

CREATE TABLE `courses` (
  `course_code` varchar(20) NOT NULL,
  `course_name` varchar(150) NOT NULL,
  `program_name` varchar(100) NOT NULL,
  `credits` float DEFAULT 3
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `courses`
--

INSERT INTO `courses` (`course_code`, `course_name`, `program_name`, `credits`) VALUES
('BUS312', 'Financial Management', 'Business Administration', 4),
('CS101', 'Intro to Algorithms', 'Computer Science', 4),
('CS302', 'Database Systems', 'Computer Science', 4),
('IT205', 'Network Security Fundamentals', 'Information Technology', 3),
('IT410', 'Cloud Architecture', 'Information Technology', 3.5);

-- --------------------------------------------------------

--
-- Table structure for table `grades`
--

CREATE TABLE `grades` (
  `id` int(11) NOT NULL,
  `student_name` varchar(100) NOT NULL,
  `student_id` varchar(50) NOT NULL,
  `course_name` varchar(100) DEFAULT NULL,
  `module_name` varchar(100) DEFAULT NULL,
  `test1` decimal(5,2) DEFAULT NULL,
  `test2` decimal(5,2) DEFAULT NULL,
  `assignments` decimal(5,2) DEFAULT NULL,
  `final` decimal(5,2) DEFAULT NULL,
  `total_score` decimal(5,2) DEFAULT NULL,
  `letter_grade` varchar(2) DEFAULT NULL,
  `gpa` decimal(3,1) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `grades`
--

INSERT INTO `grades` (`id`, `student_name`, `student_id`, `course_name`, `module_name`, `test1`, `test2`, `assignments`, `final`, `total_score`, `letter_grade`, `gpa`, `created_at`) VALUES
(1, 'anord anord', 'anord anord', 'Computer Science', 'Database Systems', 5.00, 5.00, 14.90, 49.90, 54.84, 'B', 3.0, '2026-05-24 14:07:28'),
(2, 'Abdul ali clathon', 'SMS-2026-009', 'Computer Science', 'Database Systems', 8.00, 8.00, 14.00, 69.90, 71.94, 'A', 5.0, '2026-05-26 16:20:02'),
(3, 'samson', 'SMS-2026-001', 'Computer Science', 'Intro to Algorithms', 8.00, 9.00, 14.90, 70.00, 73.90, 'A', 5.0, '2026-05-26 17:17:35');

-- --------------------------------------------------------

--
-- Table structure for table `programs`
--

CREATE TABLE `programs` (
  `id` int(11) NOT NULL,
  `program_name` varchar(100) NOT NULL,
  `department` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `programs`
--

INSERT INTO `programs` (`id`, `program_name`, `department`) VALUES
(1, 'Computer Science', 'School of Engineering & Tech'),
(2, 'Information Technology', 'School of Engineering & Tech'),
(3, 'Business Administration', 'School of Business');

-- --------------------------------------------------------

--
-- Table structure for table `students`
--

CREATE TABLE `students` (
  `id` int(11) NOT NULL,
  `fullname` varchar(100) NOT NULL,
  `gender` varchar(10) DEFAULT NULL,
  `course` varchar(100) DEFAULT NULL,
  `email` varchar(100) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `photo` varchar(255) DEFAULT NULL,
  `gpa` decimal(3,2) DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `students`
--

INSERT INTO `students` (`id`, `fullname`, `gender`, `course`, `email`, `phone`, `photo`, `gpa`, `created_at`, `updated_at`) VALUES
(1, 'samson', 'Male', 'Information Technology', 'samsonprogrmmer@gmail.com', '0760360427', NULL, 0.00, '2026-05-23 11:06:28', '2026-05-23 11:06:28'),
(2, 'samsoni', 'Male', 'Information Technology', 'samsoniprogrmmer@gmail.com', '0760360428', NULL, 0.00, '2026-05-23 18:33:50', '2026-05-23 18:33:50'),
(3, 'anord anord', 'Male', 'Information Technology', 'anord@gmail.com', '0778787885', NULL, 0.00, '2026-05-24 09:29:24', '2026-05-24 09:29:24'),
(9, 'Abdul ali clathon', 'Male', 'Computer Science', 'mattaabdulhalim@gmail.com', '0778891437', 'default.png', 0.00, '2026-05-26 16:17:59', '2026-05-26 16:17:59');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` varchar(20) DEFAULT 'student',
  `email` varchar(100) DEFAULT NULL,
  `full_name` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `username`, `password`, `role`, `email`, `full_name`, `created_at`, `updated_at`) VALUES
(1, 'admin', '$2y$10$s.HGPOdX69/zXATbJNDtQuoCx7aY/k7hO5sRoHOejWgVB6w3WeiPu', 'admin', 'admin@sms.com', 'System Administrator', '2026-05-23 09:45:38', '2026-05-24 09:09:01'),
(2, 'samson', '$2y$10$Op8crSJ0oj6F0sCuFbArgO.60SMRx43imWtOABxGBwot1zejYZ3QS', 'student', NULL, NULL, '2026-05-23 11:06:28', '2026-05-23 11:06:28'),
(3, 'samsoni', '$2y$10$Q6QyKQLQRYKiBxazMoPFuu.9PqDH9.B5vUuUTFS8Jh.8wDrmWwVmq', 'student', 'samsoniprogrmmer@gmail.com', 'samsoni', '2026-05-23 18:33:50', '2026-05-23 18:33:50'),
(4, 'anord825', '$2y$10$m2SIeQ6LSHjF5P.kowqLWe9nN0trras8lwA00E46/DPlIHLLaMdsS', 'student', 'anord@gmail.com', 'anord anord', '2026-05-24 09:29:24', '2026-05-24 09:29:24'),
(9, 'abdul865', '$2y$10$2IVd8zrGVQnoOpLIDsqcRuyZCLwWMPnkN5pBDtEr12u1aNYu6Q5ta', 'student', 'mattaabdulhalim@gmail.com', 'Abdul ali clathon', '2026-05-26 16:17:59', '2026-05-26 16:17:59');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `attendance`
--
ALTER TABLE `attendance`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_attendance` (`student_id`,`attendance_date`),
  ADD KEY `idx_date` (`attendance_date`);

--
-- Indexes for table `courses`
--
ALTER TABLE `courses`
  ADD PRIMARY KEY (`course_code`),
  ADD KEY `program_name` (`program_name`);

--
-- Indexes for table `grades`
--
ALTER TABLE `grades`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `programs`
--
ALTER TABLE `programs`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `program_name` (`program_name`);

--
-- Indexes for table `students`
--
ALTER TABLE `students`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `idx_email` (`email`),
  ADD KEY `idx_fullname` (`fullname`),
  ADD KEY `idx_course` (`course`);
ALTER TABLE `students` ADD FULLTEXT KEY `ft_search` (`fullname`,`email`,`course`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `attendance`
--
ALTER TABLE `attendance`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `grades`
--
ALTER TABLE `grades`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `programs`
--
ALTER TABLE `programs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `students`
--
ALTER TABLE `students`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `attendance`
--
ALTER TABLE `attendance`
  ADD CONSTRAINT `attendance_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `courses`
--
ALTER TABLE `courses`
  ADD CONSTRAINT `courses_ibfk_1` FOREIGN KEY (`program_name`) REFERENCES `programs` (`program_name`) ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
